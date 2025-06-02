from common_utils_local import init_model, get_model, chat_with_gigachat
import os


init_model()

giga = get_model(token=os.getenv("ACCESS_TOKEN"), temperature=0)
output = chat_with_gigachat(giga, "Ты кот", "Скажи что нибудь 5 раз")
print(output)
