import { Metadata } from "next";
import { App } from "./app";
import { USE_RAG } from "@/app/lib/feature_flags";
import { projectsCollection } from "@/app/lib/mongodb";
import { notFound } from "next/navigation";
const DEFAULT_MODEL = process.env.PROVIDER_DEFAULT_MODEL || "gigachat";

export const metadata: Metadata = {
    title: "Workflow"
}

export default async function Page({
    params,
}: {
    params: { projectId: string };
}) {
    console.log('->>> workflow page being rendered');
    const project = await projectsCollection.findOne({
        _id: params.projectId,
    });
    if (!project) {
        notFound();
    }

    return (
        <App
            projectId={params.projectId}
            useRag={USE_RAG}
            defaultModel={DEFAULT_MODEL}
        />
    );
}
