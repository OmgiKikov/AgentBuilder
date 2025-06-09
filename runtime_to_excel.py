import json
import pandas as pd
from datetime import datetime

# Чтение JSON файла
with open('benchmark/run_time/run_time_result.json', 'r', encoding='utf-8') as file:
    data = json.load(file)

# Создание списка для хранения данных
rows = []

# Обработка каждой записи
for record in data:
    # Извлечение основных данных
    row = {
        'Название симуляции': record['simulation_name'],
        'ID запуска': record['run_id'],
        'Статус': record['status'],
        'Количество результатов': record['results_count'],
        'Название сценария': record['scenario_name']
    }
    
    # Добавление данных из вложенного результата
    if 'result' in record:
        result = record['result']
        row.update({
            'ID результата': result.get('_id', ''),
            'ID проекта': result.get('projectId', ''),
            'Результат': result.get('result', ''),
            'Детали': result.get('details', '')
        })
        
        # Добавление информации о транскрипции
        if 'transcript' in result:
            row['Количество сообщений'] = len(result['transcript'])
            # Сохраняем первое сообщение пользователя
            user_messages = [msg['content'] for msg in result['transcript'] if msg['role'] == 'user']
            row['Первое сообщение пользователя'] = user_messages[0] if user_messages else ''

    rows.append(row)

# Создание DataFrame
df = pd.DataFrame(rows)

# Получение текущей даты и времени для имени файла
current_time = datetime.now().strftime("%Y%m%d_%H%M%S")
output_file = f'runtime_results_{current_time}.xlsx'

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
    
    # Применение формата к заголовкам
    for col_num, value in enumerate(df.columns.values):
        worksheet.write(0, col_num, value, header_format)
    
    # Автоматическая настройка ширины столбцов
    for i, col in enumerate(df.columns):
        max_length = max(
            df[col].astype(str).apply(len).max(),
            len(str(col))
        )
        worksheet.set_column(i, i, min(max_length + 2, 50))  # Ограничиваем максимальную ширину 50 символами

print(f"Excel файл успешно создан: {output_file}") 