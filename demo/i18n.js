/* PlayPos — два языка интерфейса: русский и узбекский (латиница).
 * Демо-подход: интерфейс пишется по-русски, а при выборе «UZ» словарь переводит текст на странице
 * (включая окна и уведомления, которые появляются позже). В рабочей версии будет полноценная
 * локализация с файлами переводов (ru.json / uz.json) и выбором языка в профиле сотрудника. */
(function () {
  "use strict";
  const KEY = "playpos-lang";
  let lang = "ru";
  try { lang = localStorage.getItem(KEY) || "ru"; } catch (e) {}
  // Ссылка вида ?lang=uz сразу открывает нужный язык (удобно отправлять клиенту)
  const q = new URLSearchParams(location.search).get("lang");
  if (q === "uz" || q === "ru") { lang = q; try { localStorage.setItem(KEY, q); } catch (e) {} }
  if (lang !== "uz") lang = "ru";
  document.documentElement.lang = lang;

  const UZ = {
    // Меню и общие
    "Площадка": "Maydoncha", "Посещения": "Tashriflar", "Счета": "Hisoblar", "Смены": "Smenalar", "Расходы": "Xarajatlar",
    "Отчёты": "Hisobotlar", "Тарифы": "Tariflar", "Сотрудники": "Xodimlar", "Настройки": "Sozlamalar",
    "Владелец": "Egasi", "Администратор": "Administrator", "Кассир": "Kassir", "Выйти": "Tizimdan chiqish",
    "Смена не открыта": "Smena ochilmagan", "Смена №": "Smena №", ", открыта в": ", ochilgan:",
    "Отмена": "Bekor qilish", "Сохранить": "Saqlash", "Сохранено": "Saqlandi", "Создать": "Yaratish", "Добавить": "Qo'shish",
    "Изменить": "O'zgartirish", "Закрыть": "Yopish", "Вернуть": "Qaytarish", "В архив": "Arxivga", "Все": "Barchasi",
    "Сегодня": "Bugun", "Вчера": "Kecha", "7 дней": "7 kun", "Нет данных": "Ma'lumot yo'q", "Пока пусто": "Hozircha bo'sh",
    "сум": "so'm", "мин": "daq", "минут": "daqiqa", "минуты": "daqiqa", "час": "soat", "часа": "soat", "ч": "soat",
    "← на сайт": "← saytga",

    // Вход
    "Вход сотрудника": "Xodim kirishi", "Войти": "Kirish", "Выберите сотрудника": "Xodimni tanlang", "Неверный PIN": "PIN noto'g'ri",
    "Демо: PIN владельца Азиза —": "Demo: egasi Aziz PIN —", ", кассира Алии —": ", kassir Aliya —",
    ", администратора Дилнозы —": ", administrator Dilnoza —", ". Тимур заблокирован.": ". Temur bloklangan.",
    "· заблокирован": "· bloklangan", "Сотрудник заблокирован": "Xodim bloklangan",

    // Площадка
    "Новое посещение": "Yangi tashrif", "＋ Новое посещение": "＋ Yangi tashrif", "🔕 Включить звук": "🔕 Ovozni yoqish",
    "🔔 Звук включён": "🔔 Ovoz yoqilgan", "Звук включён — это тестовый сигнал": "Ovoz yoqildi — bu sinov signali",
    "Детей на площадке": "Maydonchadagi bolalar", "Просрочено": "Muddati o'tgan", "Не оплачено": "To'lanmagan",
    "Получено сегодня": "Bugun olindi", "Поиск по имени": "Ism bo'yicha qidirish", "☰ Список": "☰ Ro'yxat", "▦ Плитки": "▦ Kartochkalar",
    "Время вышло": "Vaqt tugadi", "Скоро заканчивается": "Tez orada tugaydi", "Играет": "O'ynamoqda", "Не оплачены": "To'lanmagan",
    "Время вышло — позовите ребёнка": "Vaqt tugadi — bolani chaqiring",
    "Смена не открыта — оплату принять нельзя.": "Smena ochilmagan — to'lov qabul qilib bo'lmaydi.", "Открыть смену": "Smenani ochish",
    "⏩ Продлить": "⏩ Uzaytirish", "Продлить": "Uzaytirish", "Выход": "Chiqish", "Счёт": "Hisob", "Талон": "Talon", "Завершить": "Yakunlash",
    "✓ оплачен": "✓ to'langan", "● не оплачен": "● to'lanmagan", "Оплачен": "To'langan", "Не оплачен": "To'lanmagan",
    "продлений:": "uzaytirishlar:",
    "Сейчас на площадке никого нет. Нажмите «Новое посещение».": "Hozir maydonchada hech kim yo'q. «Yangi tashrif» tugmasini bosing.",
    "В этой категории сейчас никого нет.": "Bu toifada hozir hech kim yo'q.",
    "таймер запущен": "taymer ishga tushdi", "время вышло": "vaqt tugadi", "осталось меньше": "qolgan vaqt kamroq:",

    // Новое посещение / продление
    "Имя ребёнка": "Bolaning ismi", "Например, Юсуф": "Masalan, Yusuf", "Тариф": "Tarif", "Начало:": "Boshlanishi:",
    "· окончание:": "· tugashi:", "К оплате:": "To'lovga:", "Начать, оплата при выходе": "Boshlash, to'lov chiqishda",
    "Начать и оплатить": "Boshlash va to'lash", "Введите имя ребёнка": "Bolaning ismini kiriting", "Сначала добавьте тарифы": "Avval tariflarni qo'shing",
    "Продлить время —": "Vaqtni uzaytirish —", "Сейчас: окончание": "Hozir: tugashi", "просрочено на": "kechikish:", "осталось": "qoldi",
    "На сколько продлить": "Qancha uzaytirish", "Отсчёт продления": "Uzaytirish hisobi", "От прежнего окончания": "Avvalgi tugashdan",
    "От текущего времени": "Hozirgi vaqtdan", "Новое окончание:": "Yangi tugash vaqti:", "Доплата за продление:": "Uzaytirish uchun qo'shimcha to'lov:",
    "Добавится в открытый счёт №": "Ochiq hisobga qo'shiladi №", ". Итого к оплате:": ". Jami to'lovga:",
    "Прошлый счёт оплачен — создастся новый счёт на доплату.": "Oldingi hisob to'langan — qo'shimcha to'lov uchun yangi hisob yaratiladi.",
    "Продлить и оплатить": "Uzaytirish va to'lash", "Нет тарифов для продления": "Uzaytirish uchun tarif yo'q",
    "Продление:": "Uzaytirish:", "Продление": "Uzaytirish",

    // Оплата и выход
    "Закрыть счёт": "Hisobni yopish", "Выход ребёнка": "Bola chiqishi", "· на площадке": "· maydonchada", "· счёт": "· hisob",
    "назад. Если нужна доплата — нажмите «Продлить».": "oldin. Qo'shimcha to'lov kerak bo'lsa — «Uzaytirish»ni bosing.",
    "Уже оплачено": "Allaqachon to'langan", "К оплате": "To'lovga", "Всё оплачено": "Hammasi to'langan", "Итого": "Jami",
    "Способ оплаты": "To'lov usuli", "Наличные": "Naqd pul", "Карта": "Karta", "💵 Наличные": "💵 Naqd pul", "💳 Карта": "💳 Karta",
    "наличные": "naqd pul", "карта": "karta",
    "Только учёт способа оплаты — терминалы и эквайринг не подключаются.": "Faqat to'lov usuli hisobga olinadi — terminal va ekvayring ulanmaydi.",
    "Подтвердить оплату": "To'lovni tasdiqlash", "Подтвердить оплату и выход": "To'lovni tasdiqlash va chiqish", "Отметить выход": "Chiqishni belgilash",
    "✓ Оплачено:": "✓ To'langan:", "Оплачено:": "To'langan:", "Оплачено": "To'landi", "оплачено": "to'landi", "оплачено ранее": "oldin to'langan",
    "· кассир": "· kassir", ", выход отмечен": ", chiqish belgilandi",
    "Нет права принимать оплату": "To'lov qabul qilishga ruxsat yo'q", "Нет права завершать посещения": "Tashriflarni yakunlashga ruxsat yo'q",
    "Нет права на продажу": "Sotishga ruxsat yo'q", "Нет права на продление": "Uzaytirishga ruxsat yo'q", "Нет права печатать талоны": "Talon chop etishga ruxsat yo'q",
    "Есть неоплаченный счёт — нужен сотрудник с правом оплаты": "To'lanmagan hisob bor — to'lov huquqiga ega xodim kerak",
    "Нет открытой смены и нет права её открыть": "Ochiq smena yo'q va uni ochishga ruxsat yo'q",
    "Сначала откройте смену — деньги привязываются к смене": "Avval smenani oching — pul smenaga bog'lanadi",

    // Талон
    "Талон посещения №": "Tashrif taloni №", "Ребёнок": "Bola", "Дата": "Sana", "Начало": "Boshlanishi", "Окончание": "Tugashi",
    "Счёт №": "Hisob №", "Статус": "Holat", "НЕ ОПЛАЧЕН": "TO'LANMAGAN", "Счёт ещё открыт": "Hisob hali ochiq", "Счёт оплачен": "Hisob to'langan",
    "Не является фискальным чеком": "Fiskal chek hisoblanmaydi",

    // Посещения / счета
    "План. конец": "Rejadagi tugash", "Сумма": "Summa", "Оплата": "To'lov", "завершено": "yakunlangan", "просрочено": "muddati o'tgan",
    "на площадке": "maydonchada", "оплачен": "to'langan", "открыт": "ochiq", "Открытые": "Ochiq", "Оплаченные": "To'langan",
    "Позиции": "Pozitsiyalar", "Оплатить": "To'lash", "Возврат": "Qaytarish", "Счетов нет": "Hisoblar yo'q", "возврат −": "qaytarish −",

    // Смены
    "Моя смена": "Mening smenam", "Смена не открыта.": "Smena ochilmagan.", "· открыта": "· ochilgan", "Начальный остаток": "Boshlang'ich qoldiq",
    "Наличные оплаты": "Naqd to'lovlar", "Карта (не в кассе)": "Karta (kassada emas)", "Возвраты наличными": "Naqd qaytarishlar",
    "Расходы из кассы": "Kassadan xarajatlar", "Ожидается в кассе": "Kassada bo'lishi kerak", "Фактически наличных в кассе": "Kassadagi haqiqiy naqd pul",
    "Закрыть смену": "Smenani yopish",
    "Дети на площадке и открытые счета не пропадают после закрытия смены — их продолжит следующая смена.": "Maydonchadagi bolalar va ochiq hisoblar smena yopilgandan keyin yo'qolmaydi — ularni keyingi smena davom ettiradi.",
    "История смен": "Smenalar tarixi", "Открыта": "Ochilgan", "Закрыта": "Yopilgan", "открыта": "ochiq", "Ожидалось": "Kutilgan", "Факт": "Haqiqiy",
    "Расхождение": "Farq", "Начальный остаток в кассе": "Kassadagi boshlang'ich qoldiq", "Смена открыта": "Smena ochildi",
    "Введите фактическую сумму наличных": "Haqiqiy naqd summani kiriting", "Смена закрыта, касса сошлась ✓": "Smena yopildi, kassa to'g'ri ✓",
    "Смена закрыта. Расхождение:": "Smena yopildi. Farq:",

    // Расходы
    "＋ Добавить расход": "＋ Xarajat qo'shish", "Новый расход": "Yangi xarajat", "Категория": "Toifa", "Сумма, сум": "Summa, so'm",
    "Комментарий": "Izoh", "Источник денег": "Pul manbai", "Источник": "Manba", "Автор": "Muallif", "Наличные из кассы текущей смены": "Joriy smena kassasidan naqd",
    "(смена не открыта)": "(smena ochilmagan)", "Другой источник (не из кассы)": "Boshqa manba (kassadan emas)", "Другой источник": "Boshqa manba",
    "Касса смены": "Smena kassasi", "Расходов пока нет": "Hozircha xarajatlar yo'q", "Введите сумму": "Summani kiriting",
    "Хозтовары": "Xo'jalik mollari", "Аренда": "Ijara", "Зарплата": "Ish haqi", "Ремонт": "Ta'mirlash", "Реклама": "Reklama", "Прочее": "Boshqa",
    "Салфетки, антисептик": "Salfetkalar, antiseptik", "Время": "Vaqt",

    // Возвраты
    "Возврат по счёту №": "Hisob bo'yicha qaytarish №", "можно вернуть:": "qaytarish mumkin:", "Сумма возврата": "Qaytarish summasi",
    "Причина (обязательно)": "Sabab (majburiy)", "Оформить возврат": "Qaytarishni rasmiylashtirish", "Укажите причину": "Sababni kiriting",
    "Возврат оформлен": "Qaytarish rasmiylashtirildi", "По этому счёту уже всё возвращено": "Bu hisob bo'yicha hammasi qaytarilgan", "Сумма от 1 до": "Summa 1 dan",

    // Отчёты
    "Все кассиры": "Barcha kassirlar", "Деньги": "Pul", "Получено всего": "Jami olindi", "в т.ч. продления": "shu jumladan uzaytirishlar",
    "Возвраты": "Qaytarishlar", "Результат по внесённым расходам": "Kiritilgan xarajatlar bo'yicha natija", "Средний оплаченный счёт": "O'rtacha to'langan hisob",
    "Открытые неоплаченные счета": "Ochiq to'lanmagan hisoblar",
    "«Результат по внесённым расходам» — не чистая прибыль: учтены только расходы, внесённые в программу.": "«Kiritilgan xarajatlar bo'yicha natija» — sof foyda emas: faqat dasturga kiritilgan xarajatlar hisobga olingan.",
    "Касса по кассирам": "Kassirlar bo'yicha kassa", "Оплат": "To'lovlar", "Всего": "Jami", "Нет оплат за период": "Davr uchun to'lovlar yo'q",
    "Смены и сверка кассы": "Smenalar va kassa solishtiruvi", "Смена": "Smena", "Ожидалось в кассе": "Kassada kutilgan", "Нет смен за период": "Davr uchun smenalar yo'q",
    "Начато": "Boshlangan", "Завершено": "Yakunlangan", "Сейчас на площадке": "Hozir maydonchada", "Продлений": "Uzaytirishlar",
    "Популярные тарифы": "Mashhur tariflar", "Все оплаты": "Barcha to'lovlar", "Способ": "Usul", "Журнал действий": "Harakatlar jurnali",
    "Вход": "Kirish", "Завершение": "Yakunlash", "Открытие смены": "Smenani ochish", "Закрытие смены": "Smenani yopish",
    "Расход": "Xarajat", "Печать талона": "Talon chop etish", "Права изменены": "Huquqlar o'zgartirildi", "Сотрудник создан": "Xodim yaratildi",
    "Сотрудник разблокирован": "Xodim blokdan chiqarildi", "Тариф создан": "Tarif yaratildi", "Тариф изменён": "Tarif o'zgartirildi",
    "Тариф в архиве": "Tarif arxivda", "Шаблон тарифов": "Tariflar shabloni", "изменены": "o'zgartirildi", "вышел(ла) в": "chiqdi:", ", расхождение": ", farq",

    // Тарифы
    "＋ Новый тариф": "＋ Yangi tarif", "Ваши тарифы": "Sizning tariflaringiz", "вход и продление": "kirish va uzaytirish", "только вход": "faqat kirish",
    "только продление": "faqat uzaytirish",
    "Тарифы не удаляются, а архивируются: история посещений и счетов сохраняет цену на момент продажи.": "Tariflar o'chirilmaydi, arxivlanadi: tashriflar va hisoblar tarixi sotuv paytidagi narxni saqlaydi.",
    "Готовые шаблоны": "Tayyor shablonlar", "Типичные схемы игровых площадок. Добавьте и поправьте цены под свой рынок.": "O'yin maydonchalari uchun odatiy sxemalar. Qo'shing va narxlarni o'z bozoringizga moslang.",
    "Добавить набор": "To'plamni qo'shish", "Набор «": "To'plam «", "» добавлен": "» qo'shildi",
    "Короткие сеансы": "Qisqa seanslar", "Для ТРЦ и фудкортов: родители рядом, дети играют недолго.": "SRM va fudkortlar uchun: ota-onalar yaqinda, bolalar qisqa o'ynaydi.",
    "Почасовой": "Soatbay", "Классика: полчаса, час, два часа.": "Klassika: yarim soat, bir soat, ikki soat.",
    "Безлимит + продления": "Cheksiz + uzaytirishlar", "Весь день и короткие доплаты при задержке.": "Butun kun va kechikishda qisqa qo'shimcha to'lovlar.",
    "Безлимит на день": "Kunlik cheksiz", "Новый тариф": "Yangi tarif", "Изменить тариф": "Tarifni o'zgartirish", "Название": "Nomi",
    "Например, 30 минут": "Masalan, 30 daqiqa", "Длительность, минут": "Davomiyligi, daqiqa", "Цена, сум": "Narxi, so'm", "Где использовать": "Qayerda ishlatiladi",
    "Вход и продление": "Kirish va uzaytirish", "Только вход": "Faqat kirish", "Только продление": "Faqat uzaytirish", "Цена за минуту:": "Daqiqa narxi:",
    "· за час:": "· soatiga:", "Изменение цены не меняет уже выставленные счета — в них сохранён снимок цены.": "Narx o'zgarishi berilgan hisoblarni o'zgartirmaydi — ularda narx saqlangan.",
    "Проверьте название, минуты и цену": "Nomi, daqiqalar va narxni tekshiring",

    // Сотрудники и права
    "＋ Добавить сотрудника": "＋ Xodim qo'shish", "Откройте сотрудника, чтобы включить или выключить нужные права. Выключатель на карточке — блокировка входа.": "Kerakli huquqlarni yoqish yoki o'chirish uchun xodimni oching. Kartochkadagi kalit — kirishni bloklash.",
    "Открыть и настроить доступ": "Ochish va ruxsatni sozlash", "Новый сотрудник": "Yangi xodim", "Сотрудник:": "Xodim:", "Имя": "Ism", "Роль": "Rol",
    "Логин": "Login", "PIN / пароль": "PIN / parol", "минимум 4 символа": "kamida 4 belgi", "Права доступа": "Kirish huquqlari",
    "у владельца все права": "egasida barcha huquqlar bor", "при смене роли права заполняются шаблоном — их можно изменить": "rol o'zgarganda huquqlar shablon bo'yicha to'ldiriladi — ularni o'zgartirish mumkin",
    "Касса": "Kassa", "Управление": "Boshqaruv", "Продажа": "Sotuv", "Новое посещение и выбор тарифа": "Yangi tashrif va tarif tanlash",
    "Продление времени": "Vaqtni uzaytirish", "Кнопка «Продлить» с доплатой": "Qo'shimcha to'lovli «Uzaytirish» tugmasi", "Приём оплаты": "To'lov qabul qilish",
    "Закрытие счёта: наличные или карта": "Hisobni yopish: naqd yoki karta", "Завершение посещения": "Tashrifni yakunlash", "Отметить выход ребёнка": "Bola chiqishini belgilash",
    "Талон 58/80 мм": "Talon 58/80 mm", "Своя смена": "O'z smenasi", "Открытие и закрытие кассовой смены": "Kassa smenasini ochish va yopish",
    "Выручка, посещения, итоги смен": "Tushum, tashriflar, smena yakunlari", "Добавление расходов": "Xarajatlarni qo'shish",
    "Возврат денег по оплаченному счёту": "To'langan hisob bo'yicha pulni qaytarish", "Создание и архив тарифов": "Tariflarni yaratish va arxivlash",
    "Создание кассиров и выдача прав": "Kassirlar yaratish va huquq berish", "Настройки площадки": "Maydoncha sozlamalari", "Название, принтер, звук": "Nomi, printer, ovoz",
    "Заполните имя и логин": "Ism va loginni to'ldiring", "PIN — минимум 4 символа": "PIN — kamida 4 belgi", "Такой логин уже есть": "Bunday login allaqachon bor",
    "Активен": "Faol", "Заблокирован": "Bloklangan",

    // Настройки
    "Название (печатается на талоне)": "Nomi (talonda chop etiladi)", "Ширина бумаги принтера": "Printer qog'ozi kengligi", "58 мм": "58 mm", "80 мм": "80 mm",
    "Предупреждать за, минут": "Necha daqiqa oldin ogohlantirish", "Цвета бренда": "Brend ranglari", "Солнечная площадка": "Quyoshli maydoncha",
    "Конфетти": "Konfetti", "Джунгли": "Jungli", "Ночь (как на макете)": "Tun (maket kabi)", "Демо-данные": "Demo ma'lumotlar",
    "Данные демо хранятся только в этом браузере.": "Demo ma'lumotlari faqat shu brauzerda saqlanadi.", "Сбросить демо": "Demoni tiklash",
    "Сбросить все демо-данные?": "Barcha demo ma'lumotlarni tiklaysizmi?", "Язык интерфейса": "Interfeys tili",
    "Kids Jungle — Чиланзар": "Kids Jungle — Chilonzor",

    // Имена из демо-данных
    "Азиз": "Aziz", "Алия": "Aliya", "Тимур": "Temur", "Дилноза": "Dilnoza", "Юсуф": "Yusuf", "Амина": "Amina", "Саша": "Sasha", "Лейла": "Leyla",
    "Мадина": "Madina", "Ибрагим": "Ibrohim", "Камила": "Kamila", "Самира": "Samira", "Абдулла": "Abdulla", "Сабина": "Sabina", "Давид": "David",
    "Зарина": "Zarina", "Умар": "Umar", "Мария": "Mariya", "Ислам": "Islom", "Нигора": "Nigora", "Артём": "Artyom", "Шахзода": "Shahzoda",
    "Бобур": "Bobur", "Алина": "Alina", "Жасур": "Jasur", "Малика": "Malika", "Рустам": "Rustam", "София": "Sofiya", "Анвар": "Anvar",
    "Лола": "Lola", "Карим": "Karim", "Ева": "Yeva", "Бахтияр": "Baxtiyor", "Диана": "Diana",

    // Сайт (лендинг)
    "Возможности": "Imkoniyatlar", "Бренд": "Brend", "Открыть демо": "Demoni ochish", "Войти в кассу": "Kassaga kirish", "Установка": "O'rnatish", "Тариф возвращён": "Tarif qaytarildi", "Установка площадки": "Maydonchani o'rnatish",
    "Код установки": "O'rnatish kodi", "Название площадки": "Maydoncha nomi", "Имя владельца": "Egasining ismi", "Логин владельца (латиница)": "Egasining logini (lotin)",
    "Пароль (минимум 6 символов)": "Parol (kamida 6 belgi)", "Создать площадку": "Maydoncha yaratish", "Один раз: создаём площадку и учётную запись владельца.": "Bir marta: maydoncha va egasining hisob qaydnomasi yaratiladi.", "Установка возможна только на компьютере кассы": "O'rnatish faqat kassa kompyuterida mumkin", "Неверный код установки": "O'rnatish kodi noto'g'ri",
    "Площадка уже создана — войдите под владельцем": "Maydoncha allaqachon yaratilgan — egasi sifatida kiring", "Готово! Открываем кассу…": "Tayyor! Kassa ochilmoqda…", "Для детских игровых площадок": "Bolalar o'yin maydonchalari uchun",
    "Каждая минута игры": "O'yinning har bir daqiqasi", "под контролем": "nazorat ostida",
    "PlayPos запускает таймер на ребёнка, подсвечивает тех, у кого время заканчивается, продлевает в один клик и сам пересчитывает сумму. Касса, смены, сотрудники и отчёты — в одном окне.": "PlayPos har bir bola uchun taymer ishga tushiradi, vaqti tugayotganlarni ajratib ko'rsatadi, bir bosishda uzaytiradi va summani o'zi qayta hisoblaydi. Kassa, smenalar, xodimlar va hisobotlar — bitta oynada.",
    "Попробовать демо →": "Demoni sinab ko'rish →", "Что умеет": "Nimalar qila oladi", "На площадке": "Maydonchada", "Выручка": "Tushum",
    "Время вышло · не оплачен": "Vaqt tugadi · to'lanmagan", "Осталось мало · оплачен": "Kam qoldi · to'langan", "Играет · оплачен": "O'ynamoqda · to'langan",
    "Играет · счёт открыт": "O'ynamoqda · hisob ochiq", "Всё, что нужно кассиру и владельцу": "Kassir va ega uchun kerakli hamma narsa",
    "Простые большие кнопки для планшета и подробные отчёты для владельца.": "Planshet uchun oddiy katta tugmalar va ega uchun batafsil hisobotlar.",
    "Таймеры с цветами": "Rangli taymerlar", "Зелёный — играет, жёлтый — осталось 5 минут, красный — время вышло и звучит сигнал.": "Yashil — o'ynamoqda, sariq — 5 daqiqa qoldi, qizil — vaqt tugadi va signal chaladi.",
    "Продление в 1 клик": "1 bosishda uzaytirish", "Кнопка «Продлить» прямо на карточке: +10, +30 минут — сумма сразу добавляется в счёт.": "«Uzaytirish» tugmasi to'g'ridan-to'g'ri qatorda: +10, +30 daqiqa — summa darhol hisobga qo'shiladi.",
    "Свои тарифы": "O'z tariflaringiz", "Владелец сам задаёт тарифы: 10, 20, 30 минут, час, безлимит. Есть готовые шаблоны по рынку.": "Ega tariflarni o'zi belgilaydi: 10, 20, 30 daqiqa, soat, cheksiz. Bozor bo'yicha tayyor shablonlar bor.",
    "Сотрудники и доступы": "Xodimlar va ruxsatlar", "Создавайте кассиров и включайте/выключайте каждое право: продажа, отчёты, расходы, возвраты…": "Kassirlar yarating va har bir huquqni yoqing/o'chiring: sotuv, hisobotlar, xarajatlar, qaytarishlar…",
    "Наличные или карта": "Naqd pul yoki karta", "Ручной учёт способа оплаты без эквайринга и интеграций. Смены с подсчётом кассы.": "To'lov usulini qo'lda hisobga olish, ekvayring va integratsiyalarsiz. Kassa hisobi bilan smenalar.",
    "Отчёты за день": "Kunlik hisobotlar", "Посещения, продления, выручка по способам оплаты, расходы и популярные тарифы.": "Tashriflar, uzaytirishlar, to'lov usullari bo'yicha tushum, xarajatlar va mashhur tariflar.",
    "Как проходит посещение": "Tashrif qanday o'tadi", "Счёт и посещение независимы: оплатить можно на входе, а таймер продолжит работать.": "Hisob va tashrif mustaqil: kirishda to'lash mumkin, taymer esa ishlashda davom etadi.",
    "Кассир вводит имя ребёнка и выбирает тариф.": "Kassir bolaning ismini kiritadi va tarifni tanlaydi.",
    "Счёт можно закрыть сразу — «Наличные» выбраны по умолчанию.": "Hisobni darhol yopish mumkin — «Naqd pul» sukut bo'yicha tanlangan.",
    "За 5 минут карточка желтеет, после окончания — краснеет и звучит сигнал.": "5 daqiqa qolganda qator sarg'ayadi, tugagach — qizaradi va signal chaladi.",
    "«Продлить» добавляет минуты и сумму: в открытый счёт или отдельным счётом на доплату.": "«Uzaytirish» daqiqa va summani qo'shadi: ochiq hisobga yoki alohida qo'shimcha hisobga.",
    "«Завершить» — оплатить остаток и отметить выход. Печать талона 58/80 мм.": "«Chiqish» — qoldiqni to'lash va chiqishni belgilash. 58/80 mm talon chop etish.",
    "Подписка для площадки": "Maydoncha uchun obuna", "Одна площадка — свои сотрудники, тарифы и отчёты. Доступ активируется ключом.": "Bitta maydoncha — o'z xodimlari, tariflari va hisobotlari. Kirish kalit bilan faollashtiriladi.",
    "1 месяц": "1 oy", "3 месяца": "3 oy", "— сум": "— so'm", "Все функции, без ограничений по сотрудникам.": "Barcha funksiyalar, xodimlar soni cheklanmagan.",
    "То же самое, оплата раз в квартал.": "Xuddi shunday, to'lov chorakda bir marta.", "Демо": "Demo", "© PlayPos · демо-версия · Ташкент": "© PlayPos · demo-versiya · Toshkent",
    "Палитра:": "Palitra:", "Бренд-бук и варианты названия": "Brendbuk va nom variantlari", "Выгоднее": "Foydaliroq", "Чек №": "Chek №", "ИТОГО": "JAMI", "Кассир": "Kassir", "Спасибо за визит!": "Tashrifingiz uchun rahmat!", "Печать чека": "Chek chop etish",
    "🖨 Чек": "🖨 Chek", "Нет связи с сервером — действия не сохраняются. Проверьте интернет.": "Server bilan aloqa yo'q — amallar saqlanmaydi. Internetni tekshiring.",
    "Загрузка…": "Yuklanmoqda…", "Введите логин и пароль": "Login va parolni kiriting", "Неверный логин или пароль": "Login yoki parol noto'g'ri",
    "Войдите в систему": "Tizimga kiring", "Сначала откройте смену": "Avval smenani oching", "Счёт уже оплачен": "Hisob allaqachon to'langan",
    "Слишком много попыток. Подождите 10 минут": "Urinishlar juda ko'p. 10 daqiqa kuting", "пусто — не менять": "bo'sh — o'zgartirmaslik",
    "Нет связи с сервером": "Server bilan aloqa yo'q", "Ошибка сервера. Попробуйте ещё раз": "Server xatosi. Qayta urinib ko'ring",
    "Нет права на это действие": "Bu amalga ruxsat yo'q", "Смена уже открыта": "Smena allaqachon ochilgan", "Выход уже отмечен": "Chiqish allaqachon belgilangan",
    "Нельзя заблокировать себя": "O'zingizni bloklab bo'lmaydi", "Тариф не найден": "Tarif topilmadi", "Посещение не найдено или уже завершено": "Tashrif topilmadi yoki yakunlangan",
    "Сумма больше, чем можно вернуть": "Summa qaytarish mumkin bo'lganidan ko'p", "Укажите PIN / пароль": "PIN / parolni kiriting",
    "Логин: латинские буквы, цифры, точка, дефис": "Login: lotin harflari, raqamlar, nuqta, chiziqcha",
    "Название площадки и время предупреждения общие для всех касс. Принтер, бумага и печать чека настраиваются на каждом компьютере отдельно.": "Maydoncha nomi va ogohlantirish vaqti barcha kassalar uchun umumiy. Printer, qog'oz va chek chop etish har bir kompyuterda alohida sozlanadi.", "Способ печати": "Chop etish usuli", "Windows (драйвер)": "Windows (drayver)", "USB напрямую": "To'g'ridan-to'g'ri USB",
    "Принтер:": "Printer:", "не подключён": "ulanmagan", "Подключить принтер": "Printerni ulash", "Тестовый чек": "Sinov cheki",
    "Кодовая страница (ESC t)": "Kod sahifasi (ESC t)", "Открывать денежный ящик при оплате наличными": "Naqd to'lovda pul qutisini ochish",
    "Этот браузер не поддерживает USB-печать — откройте кассу в Chrome или Edge.": "Bu brauzer USB orqali chop etishni qo'llamaydi — kassani Chrome yoki Edge'da oching.",
    "Перед подключением замените драйвер принтера на WinUSB программой Zadig (как в Clopos). После этого обычная печать Windows на этот принтер работать не будет.": "Ulashdan oldin Zadig dasturi orqali printer drayverini WinUSB'ga almashtiring (Clopos'dagi kabi). Shundan so'ng bu printerga oddiy Windows chop etishi ishlamaydi.",
    "Принтер подключён": "Printer ulandi", "Тестовый чек отправлен": "Sinov cheki yuborildi", "Принтер": "Printer", "Кириллица": "Kirill", "Не удалось подключить:": "Ulab bo'lmadi:",
    "Ошибка печати:": "Chop etish xatosi:", "USB-принтер:": "USB printer:", ". Печать через Windows.": ". Windows orqali chop etiladi.", "Принтер не подключён": "Printer ulanmagan", "Печатать чек после оплаты": "To'lovdan keyin chek chop etish", "Чек выходит сразу, когда кассир подтверждает оплату": "Kassir to'lovni tasdiqlashi bilan chek darhol chiqadi", "Ночь": "Tun",
    "PlayPos — касса и таймеры для детской площадки": "PlayPos — bolalar maydonchasi uchun kassa va taymerlar", "PlayPos — демо программы": "PlayPos — dastur demosi",
  };

  const keys = Object.keys(UZ).sort((a, b) => b.length - a.length);
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Фраза заменяется только целиком — не внутри другого русского слова
  const re = new RegExp("(?<![А-Яа-яЁё])(" + keys.map(escRe).join("|") + ")(?![А-Яа-яЁё])", "g");
  const CYR = /[А-Яа-яЁё]/;
  const tr = (s) => (lang === "uz" && s && CYR.test(s) ? s.replace(re, (m) => UZ[m]) : s);

  function walk(root) {
    if (lang !== "uz" || !root) return;
    if (root.nodeType === 3) { const v = tr(root.nodeValue); if (v !== root.nodeValue) root.nodeValue = v; return; }
    if (root.nodeType !== 1 || root.tagName === "SCRIPT" || root.tagName === "STYLE") return;
    ["placeholder", "title", "aria-label"].forEach((a) => { if (root.hasAttribute(a)) { const v = tr(root.getAttribute(a)); if (v !== root.getAttribute(a)) root.setAttribute(a, v); } });
    for (let n = root.firstChild; n; n = n.nextSibling) walk(n);
  }

  if (lang === "uz") {
    new MutationObserver((ms) => ms.forEach((m) => {
      if (m.type === "characterData") walk(m.target);
      else if (m.type === "attributes") walk(m.target);
      else m.addedNodes.forEach(walk);
    })).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["placeholder", "title", "aria-label"] });
    document.addEventListener("DOMContentLoaded", () => { walk(document.body); document.title = tr(document.title); });
  }

  window.PPI18N = {
    lang: () => lang,
    tr,
    set(l) { try { localStorage.setItem(KEY, l); } catch (e) {} location.reload(); },
    switcher: () => `<span class="lang">${["ru", "uz"].map((l) => `<button data-lang="${l}" class="${lang === l ? "on" : ""}">${l === "ru" ? "RU" : "UZ"}</button>`).join("")}</span>`,
  };
  document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("[data-lang]"); if (b) window.PPI18N.set(b.dataset.lang); });
})();
