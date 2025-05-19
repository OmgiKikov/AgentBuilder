'use server';
import { AgenticAPIInitStreamResponse, convertFromAgenticAPIChatMessages } from "../lib/types/agents_api_types";
import { AgenticAPIChatRequest } from "../lib/types/agents_api_types";
import { WebpageCrawlResponse } from "../lib/types/tool_types";
import { webpagesCollection } from "../lib/mongodb";
import { z } from 'zod';
import FirecrawlApp, { ScrapeResponse } from '@mendable/firecrawl-js';
import { apiV1 } from "rowboat-shared";
import { Claims, getSession } from "@auth0/nextjs-auth0";
import { getAgenticApiResponse } from "../lib/utils";
import { check_query_limit } from "../lib/rate_limiting";
import { QueryLimitError } from "../lib/client_utils";
import { projectAuthCheck } from "./project_actions";
import { USE_AUTH } from "../lib/feature_flags";
import { redisClient } from "../lib/redis";

const crawler = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY || '' });

export async function authCheck(): Promise<Claims> {
    if (!USE_AUTH) {
        return {
            email: 'guestuser@rowboatlabs.com',
            email_verified: true,
            sub: 'guest_user',
        };
    }
    const { user } = await getSession() || {};
    if (!user) {
        throw new Error('User not authenticated');
    }
    return user;
}

export async function scrapeWebpage(url: string): Promise<z.infer<typeof WebpageCrawlResponse>> {
    const page = await webpagesCollection.findOne({
        "_id": url,
        lastUpdatedAt: {
            '$gte': new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // 24 hours
        },
    });
    if (page) {
        // console.log("found webpage in db", url);
        return {
            title: page.title,
            content: page.contentSimple,
        };
    }

    // otherwise use firecrawl
    const scrapeResult = await crawler.scrapeUrl(
        url,
        {
            formats: ['markdown'],
            onlyMainContent: true
        }
    ) as ScrapeResponse;

    // save the webpage using upsert
    await webpagesCollection.updateOne(
        { _id: url },
        {
            $set: {
                title: scrapeResult.metadata?.title || '',
                contentSimple: scrapeResult.markdown || '',
                lastUpdatedAt: (new Date()).toISOString(),
            }
        },
        { upsert: true }
    );

    // console.log("crawled webpage", url);
    return {
        title: scrapeResult.metadata?.title || '',
        content: scrapeResult.markdown || '',
    };
}

export async function getAssistantResponse(request: z.infer<typeof AgenticAPIChatRequest>): Promise<{
    messages: z.infer<typeof apiV1.ChatMessage>[],
    state: unknown,
    rawRequest: unknown,
    rawResponse: unknown,
}> {
    await projectAuthCheck(request.projectId);
    if (!await check_query_limit(request.projectId)) {
        throw new QueryLimitError();
    }

    const response = await getAgenticApiResponse(request);
    return {
        messages: convertFromAgenticAPIChatMessages(response.messages),
        state: response.state,
        rawRequest: request,
        rawResponse: response.rawAPIResponse,
    };
}

export async function getAgenticResponseStreamId(
    request: z.infer<typeof AgenticAPIChatRequest>,
): Promise<z.infer<typeof AgenticAPIInitStreamResponse>> {
    // serialize the request
    const payload = JSON.stringify(request);

    // create a uuid for the stream
    const streamId = crypto.randomUUID();

    // store payload in redis
    await redisClient.set(`chat-stream-${streamId}`, payload, {
        EX: 60 * 10, // expire in 10 minutes
    });

    return {
        streamId,
    };
}

export { getAgenticResponseStreamId as getAssistantResponseStreamId };