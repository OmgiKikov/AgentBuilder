import os
import tempfile
import subprocess
import logging
import uuid
import sys
from typing import Optional
from openai import OpenAI

# Настройка логирования
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("audio_transcription")


def transcribe_audio(audio_data: bytes, language: str = "ru") -> Optional[str]:
    """
    Преобразует аудиоданные в текст с использованием OpenAI API.

    Args:
        audio_data: Бинарные данные аудиофайла
        language: Код языка для распознавания (по умолчанию 'ru')

    Returns:
        Распознанный текст или None, если произошла ошибка
    """
    input_filename = None
    output_filename = None

    try:
        logger.info(f"Начало транскрипции аудио, размер данных: {len(audio_data)} байт, язык: {language}")

        # Создаем временный файл для сохранения входных аудиоданных
        input_filename = os.path.join(tempfile.gettempdir(), f"audio_input_{uuid.uuid4()}")
        with open(input_filename, "wb") as f:
            f.write(audio_data)
        logger.debug(f"Входной файл создан: {input_filename}")

        # Создаем временный файл для выходного WAV
        output_filename = os.path.join(tempfile.gettempdir(), f"audio_output_{uuid.uuid4()}.wav")
        logger.debug(f"Выходной файл будет: {output_filename}")

        # Конвертируем аудио в WAV формат с помощью ffmpeg
        try:
            logger.debug("Запуск ffmpeg для конвертации аудио в WAV...")
            command = [
                "ffmpeg",
                "-i",
                input_filename,
                "-ar",
                "16000",  # Частота дискретизации 16кГц
                "-ac",
                "1",  # Моно аудио
                "-y",  # Перезаписывать файл если существует
                output_filename,
            ]
            logger.debug(f"Команда ffmpeg: {' '.join(command)}")

            result = subprocess.run(command, check=True, capture_output=True)
            logger.debug("Конвертация завершена успешно")
        except subprocess.CalledProcessError as e:
            logger.error(f"Ошибка при конвертации аудио: {e}")
            logger.error(f"STDOUT: {e.stdout.decode('utf-8', errors='ignore')}")
            logger.error(f"STDERR: {e.stderr.decode('utf-8', errors='ignore')}")
            raise

        # Проверяем, что файл существует и имеет корректный размер
        if not os.path.exists(output_filename):
            logger.error(f"Выходной файл не существует: {output_filename}")
            return None

        file_size = os.path.getsize(output_filename)
        logger.debug(f"Размер сконвертированного WAV файла: {file_size} байт")
        if file_size == 0:
            logger.error("Сконвертированный WAV файл имеет нулевой размер")
            return None

        # Используем OpenAI API для транскрипции
        logger.debug("Начало транскрипции через OpenAI API...")
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

        try:
            with open(output_filename, "rb") as audio_file:
                logger.debug(f"Отправка запроса в OpenAI API с языком {language}...")
                model = "gpt-4o-mini-transcribe"
                logger.debug(f"Используемая модель: {model}")

                transcript = client.audio.transcriptions.create(file=audio_file, language=language, model=model)

                text = transcript.text
                logger.info(f"Успешное распознавание текста: '{text}'")
                return text

        except Exception as api_error:
            logger.error(f"Ошибка при запросе к OpenAI API: {api_error}")
            return None

    except Exception as e:
        logger.error(f"Неожиданная ошибка при распознавании речи: {e}", exc_info=True)
        return None
    finally:
        # Убеждаемся, что временные файлы удалены
        for filename in [input_filename, output_filename]:
            if filename and os.path.exists(filename):
                try:
                    os.remove(filename)
                    logger.debug(f"Удален временный файл: {filename}")
                except Exception as cleanup_error:
                    logger.error(f"Ошибка при удалении временного файла {filename}: {cleanup_error}")
