from mcp.server.lowlevel import Server
from starlette.applications import Starlette
from mcp.server.sse import SseServerTransport
from starlette.requests import Request
from starlette.routing import Mount, Route
import uvicorn
import os
import json
from typing import Dict, Any, List
import mcp.types as types
from starlette.responses import JSONResponse, Response

# Инициализируем MCP сервер
app = Server("hello_server")
# http://hello-mcp-server:8080/sse


@app.list_tools()
async def list_tools() -> list[types.Tool]:
    """Возвращает список доступных инструментов."""
    return [
        types.Tool(
            name="calculator",
            description="Функция, получаем строку чисел и арифметическиз операций и вызывае eval для ответа",
            inputSchema={
                "type": "object",
                "required": ["question"],
                "properties": {
                    "question": {
                        "type": "string",
                        "description": "Строка чисел и арифметическиз операций которые нужно посчитать",
                    }
                },
            },
        )
    ]


@app.call_tool()
async def call_tool(
    name: str, arguments: dict
) -> list[types.TextContent | types.ImageContent | types.EmbeddedResource]:
    """Обрабатывает вызов инструмента."""
    print(f"DEBUG: Вызов инструмента {name} с аргументами: {json.dumps(arguments, ensure_ascii=False)}")

    if name == "calculator":
        question = arguments.get("question", "")
        print(f"DEBUG: Получен вопрос: {question}")

        # Возвращаем фиксированный ответ
        try:
            response = str(eval(question))
        except:
            response = "Произошла ошибка"
        print(f"DEBUG: Отправляем ответ: {response}")

        return [types.TextContent(type="text", text=response)]

    # Если инструмент не найден
    print(f"DEBUG: Неизвестный инструмент: {name}")
    return [types.TextContent(type="text", text=f"Неизвестный инструмент: {name}")]


def create_starlette_app(mcp_server: Server, *, debug: bool = False) -> Starlette:
    """Создание Starlette приложения, которое обслуживает MCP сервер с SSE."""
    sse = SseServerTransport("/messages/")

    async def handle_sse(request: Request) -> Response:
        # Создаем опции инициализации
        init_options = mcp_server.create_initialization_options()

        # Если задан MCP_PUBLIC_URL в переменных окружения, используем его
        # Устанавливаем публичный URL непосредственно в сервере MCP
        public_url = os.environ.get("MCP_PUBLIC_URL")
        if public_url:
            mcp_server.sse_url = public_url

        async with sse.connect_sse(
            request.scope,
            request.receive,
            request._send,  # noqa: SLF001
        ) as (read_stream, write_stream):
            await mcp_server.run(
                read_stream,
                write_stream,
                init_options,
            )
        return Response()

    # Добавляем эндпоинт для получения инструментов в формате, совместимом с AgentBuilder
    async def handle_tools(request: Request) -> JSONResponse:
        tools_list = await list_tools()

        # Преобразуем в формат, ожидаемый AgentBuilder
        formatted_tools = []
        for tool in tools_list:
            formatted_tool = {"name": tool.name, "description": tool.description, "inputSchema": tool.inputSchema}
            formatted_tools.append(formatted_tool)
            print(f"DEBUG: Сформированный инструмент: {json.dumps(formatted_tool, indent=2, ensure_ascii=False)}")

        return JSONResponse(formatted_tools)

    return Starlette(
        debug=debug,
        routes=[
            Route("/sse", endpoint=handle_sse),
            Route("/tools", endpoint=handle_tools, methods=["GET"]),
            Mount("/messages/", app=sse.handle_post_message),
        ],
    )


if __name__ == "__main__":
    mcp_server = app  # Используем наш MCP сервер

    import argparse

    parser = argparse.ArgumentParser(description="Запуск MCP SSE-сервера")
    parser.add_argument("--host", default="0.0.0.0", help="Хост для привязки")
    parser.add_argument("--port", type=int, default=8080, help="Порт для прослушивания")
    args = parser.parse_args()

    # Связываем SSE обработчик запросов с MCP сервером
    starlette_app = create_starlette_app(mcp_server, debug=True)

    # Получаем URL для подключения
    public_url = os.environ.get("MCP_PUBLIC_URL", f"http://{args.host}:{args.port}/sse")
    # Устанавливаем публичный URL непосредственно в сервере MCP
    if public_url:
        mcp_server.sse_url = public_url

    print(f"Запуск сервера на {args.host}:{args.port}")
    print("Доступная функция: hello")
    print("Для подключения к серверу используйте:")
    print(f"uv run client.py {public_url}")

    uvicorn.run(starlette_app, host=args.host, port=args.port)
