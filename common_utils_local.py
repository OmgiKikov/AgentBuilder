import os
import re
import requests
import uuid
from dotenv import load_dotenv
from time import sleep
import logging
logger = logging.getLogger(__name__)
import concurrent.futures as pool
from typing import Optional, List
from langchain.output_parsers import BooleanOutputParser
from langchain.output_parsers.list import ListOutputParser
from langchain_community.chat_models.gigachat import GigaChat
from langchain.prompts import ChatPromptTemplate
from langchain_core.messages.ai import AIMessage
from langchain_core.output_parsers import StrOutputParser
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

load_dotenv()

class BooleanOutputTriggerParser(BooleanOutputParser):
    is_similar: bool = False

    def parse(self, text: str) -> bool:
        if self.is_similar:
            return True
        try:
            if 'False' in text:
                result = False
            else:
                result = True
        except:
            result = False
        self.is_similar = result
        return self.is_similar


class MyListOutputParser(ListOutputParser):
    """Парсер строк в список"""
    cyrillic_lower_letters: str = 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя'
    cyrillic_letters: str = cyrillic_lower_letters + cyrillic_lower_letters.upper()

    def parse(self, text: str) -> List[str]:
        parse_list: list = []
        giga_answer: list[str] = text.split("\n")

        for string in giga_answer:
            if bool(re.search(r'\d', string)):
                iter_letter: bool = True
                while iter_letter:
                    for elem in string:
                        if elem in self.cyrillic_letters:
                            parse_list.append(string[string.index(elem):])
                            iter_letter = False
                        if not iter_letter:
                            break
        return parse_list


def get_model(token: str, temperature: float = None, top_p: float = None, max_tokens: int = None) -> GigaChat:
    try:
        url: str = os.environ["AIGATEWAY_URL"]
        model: str = os.environ["GIGA_MODEL"]
        return GigaChat(
            verify_ssl_certs=False,
            model=model,
            access_token=token,
            temperature=temperature,
            top_p=top_p,
            max_tokens=max_tokens,
            profanity_check=False
        )
    except Exception:
        raise Exception


def try_to_aigateway(chain, invoke_params: dict):
    try:
        logger.info(f"Запрос на aigateway.")
        result = chain.invoke(invoke_params)
        logger.info(f"Запрос на aigateway. Выполнен успешно!")
        return result
    except Exception as e:
        logger.info(f"Запрос на aigateway. Выполнен не успешно. Ошибка {e}:")
        raise Exception(f"Запрос на aigateway. Выполнен не успешно. Ошибка {e}:")


def get_role_file_name(clientCharacter: str) -> str:
    roles: dict = {
        "Грубый человек": "bandit",
        "Бабушка": "grandmother",
        "Рабочий": "worker",
        "Бизнесмен. Розничная торговля": "businessman_retail_trade",
        "Бизнесмен. Средний бизнес": "businessman_medium_sized_businesses"
    }
    return roles[clientCharacter]


def sum_text(
    giga: GigaChat,
    text: str,
    system_prompt: str = "Твоя задача суммаризировать входящий текст. Важно не упустить важные данные: даты, суммы, цифры, сроки",
    user_prompt: str = "Суммаризируй текст: \n {text}"
) -> str:
    messages = [
        ("system", system_prompt),
        ("user", user_prompt)
    ]
    chat_template: ChatPromptTemplate = ChatPromptTemplate.from_messages(messages=messages)
    chain = chat_template | giga | StrOutputParser()
    logger.info(f"Запрос на суммаризацию текста")
    return try_to_aigateway(chain=chain, invoke_params={"text": text})


def parallel_invoke(chain, invoke_params: list[dict]) -> list[AIMessage]:
    max_workers = 3 if len(invoke_params) >= 3 else len(invoke_params)
    try:
        with pool.ThreadPoolExecutor(max_workers) as executor:
            result = list(executor.map(chain.invoke, invoke_params))
        return result
    except Exception as error:
        logger.info(f"Проблема с aigateway!")
        raise error


def numerate_str2list(text: str, count: int) -> list[str]:
    """Преобразование нумерованного списка (строки) в список строк"""
    target_list = []
    num_letters = [f"{i}. " for i in range(1, count + 1)]

    if len(text.splitlines()) == count:
        temp_list = [i.strip() if len(i.strip()) > 0 else False for i in text.splitlines()]
        if False not in temp_list:
            for target_str in temp_list:
                for letter_to_replace in num_letters:
                    target_str = target_str.replace(letter_to_replace, '')
                target_list.append(target_str)

            return target_list

    indexes = [text.index(letter) for letter in num_letters]
    for i in range(0, len(indexes)):
        try:
            target_str: str = text[indexes[i]:indexes[i + 1]].strip()
        except IndexError:
            target_str: str = text[indexes[i]:].strip()

        for num_letter in num_letters:
            target_str = target_str.replace(num_letter, '')

        target_list.append(target_str)

    return target_list


def get_access_token(oauth_url):
    headers = {
        'Authorization': f"Bearer {os.getenv('SECRET_KEY')}",
        'RqUID': str(uuid.uuid1()),
        'Content-Type': 'application/x-www-form-urlencoded',
    }
    data = {
        'scope': f"{os.getenv('SCOPE')}",
    }
    response = requests.post(oauth_url, headers=headers, data=data, verify=False)
    print(response)
    access_token = response.json()['access_token']
    return access_token

from typing import Union

from langchain_core.prompts import ChatPromptTemplate
from langchain_gigachat import GigaChat
from langchain_core.output_parsers import StrOutputParser

import httpx
import time
import requests


def chat_with_gigachat(giga, system_prompt, user_message, max_retries=3, retry_delay=5):
    """Функция для взаимодействия с GigaChat с поддержкой повторных попыток при таймаутах"""
    for attempt in range(max_retries):
        try:
            messages = [
                ("system", system_prompt),
                ("user", user_message)
            ]
            
            chat_template = ChatPromptTemplate.from_messages(messages=messages)
            chain = chat_template | giga | StrOutputParser()
            
            return try_to_aigateway(chain=chain, invoke_params={})
            
        except (httpx.ReadTimeout, requests.exceptions.Timeout) as e:
            if attempt < max_retries - 1:
                time.sleep(retry_delay)
                # Увеличиваем задержку для каждой следующей попытки
                retry_delay *= 2
            else:
                return f"ОШИБКА: Не удалось получить ответ после {max_retries} попыток."
        except Exception as e:
            return f"ОШИБКА: {str(e)}"
        
def init_model():
    logger.info("Инициализация модели гигачат")
    token = get_access_token(oauth_url="https://ngw.devices.sberbank.ru:9443/api/v2/oauth")
    print(token)
    os.environ["ACCESS_TOKEN"] = token

    url = os.getenv("AIGATEWAY_URL") + "/models"
    res = requests.get(url, headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}, verify=False).json()
    logger.info(f"Ответ на запрос валидных моделей: {res}")

    models_list = list()
    models = res["data"]
    print(models)
    for model in models:
        models_list.append(model["id"])

    logger.info(f"Список моделей: {models_list}")

    if "GigaChat-Pro" in models_list:
        os.environ["GIGA_MODEL"] = "GigaChat-Pro"
    elif "GigaChat-Plus" in models_list:
        os.environ["GIGA_MODEL"] = "GigaChat-Plus"
        logger.info(f"Используемая модель: {os.environ['GIGA_MODEL']}")
    elif "GigaChat" in models_list:
        os.environ["GIGA_MODEL"] = "GigaChat"
        logger.info(f"Используемая модель: {os.environ['GIGA_MODEL']}")
    else:
        raise Exception("Не удалось найти подходящую модель")

    if os.getenv("IS_PREVIEW") == "True" and os.environ["GIGA_MODEL"] + "-preview" in models_list:
        os.environ["GIGA_MODEL"] += "-preview"


