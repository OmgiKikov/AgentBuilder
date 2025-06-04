import uuid
import requests

def get_access_token():
    oauth_url = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth"
    try:
        headers = {
            'Authorization': f"Bearer ZDFhY2IzYmMtNDU5OC00OThiLWFmM2UtZDg4MmU0Mjg3MTAzOjQxZDdkNTFkLTZiMzItNDU4MC05MjNhLTQ4MDgxZGZmYTBhOA==",
            'RqUID': str(uuid.uuid1()),
            'Content-Type': 'application/x-www-form-urlencoded',
        }
        
        data = {
            'scope': "GIGACHAT_API_CORP",
        }
        
        print(f"Тестируем scope: GIGACHAT_API_CORP")
        response = requests.post(oauth_url, headers=headers, data=data, verify=False)
        
        print(f"Статус ответа: {response.status_code}")
        
        if response.status_code != 200:
            print(f"Ошибка HTTP: {response.status_code}")
            print(f"Текст ответа: {response.text}")
            return None
            
        try:
            response_data = response.json()
            # print(f"Ответ JSON: {response_data}")
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
    except:
        return None