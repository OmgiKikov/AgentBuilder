import json
import pandas as pd
from datetime import datetime

# Чтение JSON файла
with open('benchmark/design_time/design_time_result.json', 'r', encoding='utf-8') as file:
    data = json.load(file)

# Создание списка для хранения данных
rows = []

# Обработка каждой записи
for record in data:
    # Базовая информация
    row = {
        'Название сценария': record['scenario_name'],
        'Количество итераций': record['total_iterations'],
        'Успешность': record['success'],
        'Промпт агента': record['agent_prompt']
    }
    
    # Добавление информации из истории разговора
    if 'conversation_history' in record:
        conversation = record['conversation_history']
        row['Количество сообщений'] = len(conversation)
        
        # Сохраняем первое сообщение пользователя и ответ ассистента
        user_messages = [msg['content'] for msg in conversation if msg['role'] == 'user']
        assistant_messages = [msg['content'] for msg in conversation if msg['role'] == 'assistant']
        
        row['Первое сообщение пользователя'] = user_messages[0] if user_messages else ''
        row['Первый ответ ассистента'] = assistant_messages[0] if assistant_messages else ''
    
    # Добавление информации об оценке
    if 'evaluation' in record:
        for i, eval_item in enumerate(record['evaluation'], 1):
            row[f'Тест {i} - Название'] = eval_item.get('test_name', '')
            row[f'Тест {i} - Вердикт'] = eval_item.get('verdict', '')
            row[f'Тест {i} - Детали'] = eval_item.get('details', '')
            row[f'Тест {i} - Критерии'] = eval_item.get('pass_criteria', '')

    rows.append(row)

# Создание DataFrame
df = pd.DataFrame(rows)

# Получение текущей даты и времени для имени файла
current_time = datetime.now().strftime("%Y%m%d_%H%M%S")
output_file = f'design_time_results_{current_time}.xlsx'

# Создание writer объекта
with pd.ExcelWriter(output_file, engine='xlsxwriter') as writer:
    # Запись данных
    df.to_excel(writer, sheet_name='Результаты', index=False)
    
    # Получение объекта workbook и worksheet
    workbook = writer.book
    worksheet = writer.sheets['Результаты']
    
    # Форматирование
    header_format = workbook.add_format({
        'bold': True,
        'text_wrap': True,
        'valign': 'top',
        'fg_color': '#D7E4BC',
        'border': 1
    })
    
    # Формат для длинного текста
    wrap_format = workbook.add_format({
        'text_wrap': True,
        'valign': 'top'
    })
    
    # Применение формата к заголовкам
    for col_num, value in enumerate(df.columns.values):
        worksheet.write(0, col_num, value, header_format)
    
    # Автоматическая настройка ширины столбцов и высоты строк
    for i, col in enumerate(df.columns):
        # Устанавливаем максимальную ширину 100 символов для текстовых столбцов
        max_length = min(
            max(
                df[col].astype(str).apply(len).max(),
                len(str(col))
            ),
            100
        )
        worksheet.set_column(i, i, max_length + 2, wrap_format)
    
    # Установка высоты строк
    for i in range(1, len(df) + 1):
        worksheet.set_row(i, 60)  # Устанавливаем высоту 60 пунктов для всех строк с данными

print(f"Excel файл успешно создан: {output_file}") 