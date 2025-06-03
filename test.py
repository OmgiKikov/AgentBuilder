import uuid
import requests
import os
import sys

def get_access_token(oauth_url, scope_value):
    try:
        headers = {
            'Authorization': f"Bearer ZDFhY2IzYmMtNDU5OC00OThiLWFmM2UtZDg4MmU0Mjg3MTAzOjQxZDdkNTFkLTZiMzItNDU4MC05MjNhLTQ4MDgxZGZmYTBhOA==",
            'RqUID': str(uuid.uuid1()),
            'Content-Type': 'application/x-www-form-urlencoded',
        }
        
        data = {
            'scope': scope_value,
        }
        
        print(f"Тестируем scope: {scope_value}")
        response = requests.post(oauth_url, headers=headers, data=data, verify=False)
        
        print(f"Статус ответа: {response.status_code}")
        
        if response.status_code != 200:
            print(f"Ошибка HTTP: {response.status_code}")
            print(f"Текст ответа: {response.text}")
            return None
            
        try:
            response_data = response.json()
            print(f"Ответ JSON: {response_data}")
        except ValueError as e:
            print(f"Ошибка парсинга JSON: {e}")
            print(f"Текст ответа: {response.text}")
            return None
            
        if 'access_token' not in response_data:
            print("Ошибка: access_token не найден в ответе")
            print(f"Доступные ключи: {list(response_data.keys())}")
            return None
            
        access_token = response_data['access_token']
        print("Access token успешно получен!")
        return access_token
        
    except requests.exceptions.RequestException as e:
        print(f"Ошибка сетевого запроса: {e}")
        return None
    except Exception as e:
        print(f"Неожиданная ошибка: {e}")
        return None


def test_different_scopes(oauth_url):
    """Тестируем разные возможные scope значения"""
    possible_scopes = [
        'GIGACHAT_API_PERS',
        'GIGACHAT_API_CORP',
        'GIGACHAT_API_B2B',
        'SBER_API',
        'AI_API',
        '',  # Пустой scope
        'default',
        'api',
    ]
    
    print("Тестируем различные scope значения...\n")
    
    for scope in possible_scopes:
        print(f"--- Тест scope: '{scope}' ---")
        token = get_access_token(oauth_url, scope)
        if token:
            print(f"✅ Успешно! Токен получен для scope: '{scope}'")
            print(f"Токен: {token[:50]}...")
            return token
        print(f"❌ Неудачно для scope: '{scope}'\n")
    
    return None


if __name__ == "__main__":
    oauth_url = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth"
    
    # Сначала пробуем значение из переменной окружения, если есть
    scope_from_env = os.getenv('SCOPE')
    if scope_from_env:
        print(f"Используем scope из переменной окружения: {scope_from_env}")
        token = get_access_token(oauth_url, scope_from_env)
        if token:
            print(f"Успешно получен токен: {token[:50]}...")
            sys.exit(0)
        print("Переменная окружения не сработала, пробуем другие варианты...\n")
    
    # Если не сработало, тестируем разные варианты
    token = test_different_scopes(oauth_url)
    
    if not token:
        print("\n❌ Ни один scope не сработал.")
        print("Возможные причины:")
        print("1. Неверный Authorization токен")
        print("2. Токен истёк")
        print("3. Неправильный endpoint API")
        print("4. Ограничения доступа в Sber API")