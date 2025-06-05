# Install with pip install firecrawl-py
import asyncio
from firecrawl import AsyncFirecrawlApp, ScrapeOptions

async def main():
    app = AsyncFirecrawlApp(api_key='fc-5f994925f6104da69ddaea12bd13519b')
    response = await app.search(
        query='Погода в москве',
        limit=2,
        scrape_options=ScrapeOptions(formats=['markdown'])
    )
    print(response)

asyncio.run(main())