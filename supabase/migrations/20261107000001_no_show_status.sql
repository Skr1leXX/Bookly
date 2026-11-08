-- «Клиент не пришёл». Отдельная миграция: новое значение enum нельзя использовать в той же транзакции.
alter type public.appointment_status add value if not exists 'no_show';
