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
    // Обновления программы
    "Обновить сейчас": "Hozir yangilash", "Обновления": "Yangilanishlar", "↻ Проверить обновления": "↻ Yangilanishlarni tekshirish", "Версия программы:": "Dastur versiyasi:",
    "Режим разработки — обновления отключены": "Ishlab chiqish rejimi — yangilanishlar o'chirilgan", "Проверяем обновления…": "Yangilanishlar tekshirilmoqda…",
    "У вас последняя версия": "Sizda oxirgi versiya", "Скачивается версия": "Versiya yuklab olinmoqda", "загружена и готова к установке": "yuklab olindi va o'rnatishga tayyor",
    "Не удалось проверить: нет интернета. Программа проверит позже сама": "Tekshirib bo'lmadi: internet yo'q. Dastur keyinroq o'zi tekshiradi",
    "Проверка начнётся через минуту после запуска": "Tekshiruv ishga tushirilgandan bir daqiqa keyin boshlanadi",
    "Загружена новая версия PlayPos": "PlayPos'ning yangi versiyasi yuklab olindi",
    "Обновление займёт около минуты, дети на площадке, таймеры и счета сохранятся.": "Yangilash taxminan bir daqiqa davom etadi, maydonchadagi bolalar, taymerlar va hisoblar saqlanadi.",
    "Обновить PlayPos сейчас? Программа закроется примерно на минуту и откроется снова. Данные сохранятся.": "PlayPos hozir yangilansinmi? Dastur taxminan bir daqiqaga yopiladi va qayta ochiladi. Ma'lumotlar saqlanadi.",
    "Сохраняем резервную копию и устанавливаем обновление…": "Zaxira nusxa saqlanmoqda va yangilanish o'rnatilmoqda…",
    "Когда компьютер подключён к интернету, PlayPos сам проверяет обновления каждые 4 часа и скачивает их в фоне. Установка — по кнопке «Обновить сейчас» или автоматически при закрытии программы.": "Kompyuter internetga ulanganda PlayPos har 4 soatda yangilanishlarni o'zi tekshiradi va fonda yuklab oladi. O'rnatish — «Hozir yangilash» tugmasi orqali yoki dastur yopilganda avtomatik.",
    // Сброс пароля владельца
    "Забыли пароль владельца?": "Egasining parolini unutdingizmi?", "Сброс пароля владельца": "Ega parolini tiklash", "Код из PlayPos": "PlayPos kodi", "Новый пароль владельца": "Egasining yangi paroli",
    "Повторите пароль": "Parolni takrorlang", "Сменить пароль": "Parolni almashtirish", "Код — 8 цифр": "Kod — 8 ta raqam", "Пароль — минимум 6 символов": "Parol — kamida 6 belgi", "Пароли не совпадают": "Parollar mos kelmadi",
    "Пароль владельца изменён. Логин": "Ega paroli o'zgartirildi. Login",
    "Позвоните в PlayPos — вам продиктуют одноразовый код (8 цифр). Сотрудникам пароль меняет владелец в «Сотрудниках».": "PlayPos'ga qo'ng'iroq qiling — sizga bir martalik kod (8 raqam) aytiladi. Xodimlar parolini ega «Xodimlar» bo'limida almashtiradi.",
    "Нет связи с сервером PlayPos. Для сброса пароля нужен интернет": "PlayPos serveri bilan aloqa yo'q. Parolni tiklash uchun internet kerak",
    "Код недействителен. Попросите в PlayPos новый код": "Kod yaroqsiz. PlayPos'dan yangi kod so'rang", "Неверный код. Осталось попыток:": "Kod noto'g'ri. Qolgan urinishlar:",
    // Группа детей
    "Тарифы «только продление» здесь не показываются — они в кнопке «Продлить».": "«Faqat uzaytirish» tariflari bu yerda ko'rinmaydi — ular «Uzaytirish» tugmasida.",
    "«Только вход» — тариф виден только в «Новом посещении», «Только продление» — только в «Продлить».": "«Faqat kirish» — tarif faqat «Yangi tashrif»da, «Faqat uzaytirish» — faqat «Uzaytirish»da ko'rinadi.",
    "Количество детей": "Bolalar soni", "детей": "bola", "Детей": "Bolalar", "Детей в группе": "Guruhdagi bolalar", "Меньше": "Kamroq", "Больше": "Ko'proq", "Проверьте поле «Количество детей»": "«Bolalar soni» maydonini tekshiring",
    // Сотрудник в настройках
    "Сотрудник": "Xodim", "Выйти из кассы": "Kassadan chiqish", "🌐 Сайт PlayPos": "🌐 PlayPos sayti", "смена №": "smena №", "смена не открыта": "smena ochilmagan", "открыта в": "ochilgan:",
    "Выход нужен при смене кассира: следующий сотрудник входит своим логином. Дети на площадке и таймеры при этом не останавливаются.": "Chiqish kassir almashganda kerak: keyingi xodim o'z logini bilan kiradi. Maydonchadagi bolalar va taymerlar to'xtamaydi.",
    "Выйти из кассы? Чтобы продолжить работу, нужно будет снова ввести логин и пароль.": "Kassadan chiqilsinmi? Ishni davom ettirish uchun login va parolni qayta kiritish kerak bo'ladi.",
    // Время вышло → таймер стоит до решения кассира
    "▶ Продолжить": "▶ Davom ettirish", "Продолжает по минутам": "Daqiqalab davom etmoqda", "Продолжает": "Davom etmoqda", "Время вышло — таймер остановлен": "Vaqt tugadi — taymer to'xtatildi",
    "Время вышло · ждёт решения": "Vaqt tugadi · qaror kutilmoqda", "Таймер остановлен": "Taymer to'xtatildi", "Позже": "Keyinroq", "Выход и оплата": "Chiqish va to'lov", "⏩ Продлить тарифом": "⏩ Tarif bilan uzaytirish",
    "— пока вы не нажмёте «Продолжить», время и доплата не считаются.": "— «Davom ettirish» bosilmaguncha vaqt va qo'shimcha to'lov hisoblanmaydi.",
    "Время вышло, таймер остановлен — доплата не начисляется.": "Vaqt tugadi, taymer to'xtatildi — qo'shimcha to'lov hisoblanmaydi.", "продолжает, доплата": "davom etmoqda, qo'shimcha to'lov",
    "Ребёнок уже продолжает по минутам — доплата посчитается в счёте": "Bola daqiqalab davom etmoqda — qo'shimcha to'lov hisobda hisoblanadi",
    "Ребёнок уже продолжает по минутам — сначала закройте счёт": "Bola daqiqalab davom etmoqda — avval hisobni yoping", "Время ещё не вышло": "Vaqt hali tugamadi",
    "Не задана цена минуты просрочки — укажите её в «Настройках» или используйте «Продлить»": "Kechikish daqiqasi narxi belgilanmagan — «Sozlamalar»da kiriting yoki «Uzaytirish»dan foydalaning",
    "время вышло, таймер остановлен": "vaqt tugadi, taymer to'xtatildi", "Время вышло —": "Vaqt tugadi —",
    // Скидки и оплата частями
    "Скидки и изменение оплаты": "Chegirmalar va to'lovni o'zgartirish", "Скидка при оплате; исправить способ оплаты уже оплаченного счёта": "To'lovda chegirma; to'langan hisobning to'lov usulini tuzatish",
    "Наличные + карта": "Naqd + karta", "наличные + карта": "naqd + karta", "Наличными": "Naqd pulda", "Картой": "Karta orqali", "Скидка, сум": "Chegirma, so'm", "Без скидки": "Chegirmasiz",
    "Скидка": "Chegirma", "скидка": "chegirma", "Скидки": "Chegirmalar", "к оплате со скидкой": "chegirma bilan to'lovga", "Изменить оплату": "To'lovni o'zgartirish", "Оплата изменена": "To'lov o'zgartirildi",
    "Изменить оплату нельзя: смена закрыта или был возврат": "To'lovni o'zgartirib bo'lmaydi: smena yopilgan yoki qaytarish bo'lgan",
    "Смена этого счёта уже закрыта — изменить оплату нельзя": "Bu hisobning smenasi yopilgan — to'lovni o'zgartirib bo'lmaydi",
    "По счёту уже был возврат — изменить оплату нельзя": "Hisob bo'yicha qaytarish bo'lgan — to'lovni o'zgartirib bo'lmaydi",
    "Скидка больше суммы счёта": "Chegirma hisob summasidan katta", "Наличными больше, чем к оплате": "Naqd pul to'lov summasidan ko'p", "Сохранить": "Saqlash", "сейчас:": "hozir:",
    // Просрочка
    "Доплата за просрочку, сум за 1 минуту": "Kechikish uchun qo'shimcha to'lov, 1 daqiqa uchun so'm", "как в поминутном тарифе:": "daqiqalik tarifdagidek:",
    "Когда время вышло, при нажатии «Счёт» или «Выход» доплата за каждую начатую минуту добавляется сама. Пустое поле — цена из поминутного тарифа, 0 — не начислять.": "Vaqt tugaganda «Hisob» yoki «Chiqish» bosilsa, har bir boshlangan daqiqa uchun qo'shimcha to'lov o'zi qo'shiladi. Bo'sh maydon — daqiqalik tarif narxi, 0 — hisoblanmaydi.",
    "доплата за просрочку считается сама,": "kechikish uchun qo'shimcha to'lov o'zi hisoblanadi,", "за минуту.": "daqiqasiga.", "Просрочка": "Kechikish",
    "тип уже созданного тарифа не меняется. Нужен другой — создайте новый тариф.": "yaratilgan tarif turi o'zgarmaydi. Boshqasi kerak bo'lsa — yangi tarif yarating.", "По факту (поминутно)": "Fakt bo'yicha (daqiqalik)", "40 минут": "40 daqiqa",
    // Поминутный тариф (VIP)
    "Поминутный тариф продлевать не нужно — сумма считается при выходе": "Daqiqalik tarifni uzaytirish shart emas — summa chiqishda hisoblanadi",
    "Поминутный тариф оплачивается при выходе — нужен сотрудник с правом оплаты": "Daqiqalik tarif chiqishda to'lanadi — to'lov huquqi bor xodim kerak",
    "Поминутный тариф оплачивается при выходе": "Daqiqalik tarif chiqishda to'lanadi",
    "Сумма посчитается при выходе по фактическому времени.": "Summa chiqishda haqiqiy vaqt bo'yicha hisoblanadi.",
    "Таймер идёт вверх, сумма считается при выходе по каждой начатой минуте.": "Taymer oldinga sanaydi, summa chiqishda har bir boshlangan daqiqa bo'yicha hisoblanadi.",
    "поминутно, оплата при выходе": "daqiqalik, to'lov chiqishda", "Подтвердить оплату и выход": "To'lov va chiqishni tasdiqlash",
    "Фиксированное время": "Belgilangan vaqt", "Поминутно (VIP)": "Daqiqalik (VIP)", "Тип тарифа": "Tarif turi",
    "Цена за 1 минуту, сум": "1 daqiqa narxi, so'm", "Оплата при выходе": "Chiqishda to'lov", "при выходе": "chiqishda",
    "Поминутно": "Daqiqalik", "поминутно": "daqiqalik", "за 30 минут": "30 daqiqaga", "На площадке": "Maydonchada", "Вход в кассу": "Kassaga kirish", "Админ-панель": "Admin panel",
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
    "Возможности": "Imkoniyatlar", "Бренд": "Brend", "Открыть демо": "Demoni ochish", "Войти в кассу": "Kassaga kirish", // Сайт (новый лендинг)
    "Как начать": "Qanday boshlash", "Вопросы": "Savollar", "Контакты": "Aloqa", "⬇ Скачать": "⬇ Yuklab olish", "Программа для детских игровых площадок": "Bolalar o'yin maydonchalari uchun dastur", "PlayPos запускает таймер на каждого ребёнка, подсвечивает тех, у кого время заканчивается, продлевает в один клик и сам считает сумму. Касса, чеки, сотрудники и отчёты — в одной программе.": "PlayPos har bir bola uchun taymer ishga tushiradi, vaqti tugayotganlarni ajratib ko'rsatadi, bir bosishda uzaytiradi va summani o'zi hisoblaydi. Kassa, cheklar, xodimlar va hisobotlar — bitta dasturda.", "⬇ Скачать для Windows": "⬇ Windows uchun yuklab olish", "Оставить заявку": "Ariza qoldirish", "Windows 10 / 11 · работает без интернета · русский и узбекский язык": "Windows 10 / 11 · internetsiz ishlaydi · o'zbek va rus tillari", "Что умеет PlayPos": "PlayPos nimalar qila oladi", "Простые большие кнопки для кассира и подробные отчёты для владельца.": "Kassir uchun oddiy katta tugmalar va ega uchun batafsil hisobotlar.", "Таймер на каждого ребёнка": "Har bir bola uchun taymer", "Зелёный — играет, жёлтый — осталось 5 минут, красный — время вышло и звучит сигнал. 25–30 детей на одном экране.": "Yashil — o'ynamoqda, sariq — 5 daqiqa qoldi, qizil — vaqt tugadi va signal chaladi. Bitta ekranda 25–30 bola.", "Продление в один клик": "Bir bosishda uzaytirish", "+10, +20, +30 минут — сумма сразу добавляется в счёт. Ничего не нужно считать вручную.": "+10, +20, +30 daqiqa — summa darhol hisobga qo'shiladi. Qo'lda hech narsa hisoblash shart emas.", "Наличные и карта": "Naqd pul va karta", "При выходе видно, что оплачено и кем. Касса по каждому кассиру и сверка смены до сума.": "Chiqishda nima to'langani va kim qabul qilgani ko'rinadi. Har bir kassir bo'yicha kassa va smena so'mgacha solishtiriladi.", "Чековые принтеры 58 и 80 мм (Xprinter и другие) по USB. Статус принтера онлайн / офлайн прямо в программе.": "USB orqali 58 va 80 mm chek printerlari (Xprinter va boshqalar). Printer holati onlayn / oflayn — to'g'ridan-to'g'ri dasturda.", "Сотрудники и права": "Xodimlar va huquqlar", "Создавайте кассиров и включайте каждое право отдельно: продажа, отчёты, расходы, возвраты.": "Kassirlar yarating va har bir huquqni alohida yoqing: sotuv, hisobotlar, xarajatlar, qaytarishlar.", "Выручка за день, неделю, по кассирам, наличные и карта, продления, расходы, популярные тарифы.": "Kunlik va haftalik tushum, kassirlar bo'yicha, naqd va karta, uzaytirishlar, xarajatlar, mashhur tariflar.", "Как это выглядит": "Qanday ko'rinadi", "Выход и оплата": "Chiqish va to'lov", "Наличные или карта, чек печатается сразу.": "Naqd yoki karta, chek darhol chop etiladi.", "Отчёты владельца": "Ega hisobotlari", "Кто сколько принял — наличными и картой.": "Kim qancha qabul qildi — naqd va karta orqali.", "Права сотрудников": "Xodimlar huquqlari", "Каждое право включается отдельно.": "Har bir huquq alohida yoqiladi.", "10, 20, 30 минут, час, безлимит — цены задаёте вы.": "10, 20, 30 daqiqa, soat, cheksiz — narxlarni o'zingiz belgilaysiz.", "Заявка": "Ariza", "Оставьте имя и телефон — мы перезвоним и всё расскажем.": "Ism va telefoningizni qoldiring — qo'ng'iroq qilib, hammasini tushuntiramiz.", "Устанавливаем программу на ваш компьютер и подключаем чековый принтер.": "Dasturni kompyuteringizga o'rnatamiz va chek printerini ulaymiz.", "Обучение": "O'qitish", "Показываем кассирам, как работать. Это занимает 15 минут.": "Kassirlarga qanday ishlashni ko'rsatamiz. Bu 15 daqiqa vaqt oladi.", "Работа": "Ish", "Подписка на 1, 3, 6 или 12 месяцев. Обновления и поддержка включены.": "1, 3, 6 yoki 12 oylik obuna. Yangilanishlar va qo'llab-quvvatlash kiritilgan.", "Работает без интернета": "Internetsiz ishlaydi", "Касса, сервер и база данных находятся на вашем компьютере. Пропал интернет — площадка продолжает работать.": "Kassa, server va ma'lumotlar bazasi sizning kompyuteringizda. Internet uzilsa — maydoncha ishlashda davom etadi.", "Резервная копия базы каждый день": "Har kuni bazaning zaxira nusxasi", "Программа запускается вместе с Windows": "Dastur Windows bilan birga ishga tushadi", "Чек печатается без лишних окон": "Chek ortiqcha oynalarsiz chop etiladi", "Интернет нужен только для активации и продления подписки": "Internet faqat faollashtirish va obunani uzaytirish uchun kerak", "Частые вопросы": "Ko'p beriladigan savollar", "Нужен ли интернет?": "Internet kerakmi?", "Нет. Интернет нужен только один раз для активации и время от времени для проверки подписки. Всё остальное работает без него.": "Yo'q. Internet faqat bir marta faollashtirish uchun va vaqti-vaqti bilan obunani tekshirish uchun kerak. Qolgan hammasi internetsiz ishlaydi.", "Какие принтеры подходят?": "Qaysi printerlar mos keladi?", "Чековые термопринтеры 58 и 80 мм, подключённые по USB: Xprinter (например, XP-T80Q), Rongta, Epson и другие с драйвером для Windows.": "USB orqali ulangan 58 va 80 mm termo chek printerlari: Xprinter (masalan, XP-T80Q), Rongta, Epson va Windows drayveri bor boshqalar.", "Есть ли узбекский язык?": "O'zbek tili bormi?", "Да. Программа и чеки работают на русском и узбекском, переключение в одно касание.": "Ha. Dastur va cheklar o'zbek va rus tillarida ishlaydi, bir bosishda almashtiriladi.", "Что будет, если закончится подписка?": "Obuna tugasa nima bo'ladi?", "Данные сохраняются. Новые посещения нельзя открыть, пока подписка не продлена, но детей на площадке можно рассчитать, а отчёты остаются доступны.": "Ma'lumotlar saqlanadi. Obuna uzaytirilmaguncha yangi tashrif ochib bo'lmaydi, lekin maydonchadagi bolalar bilan hisob-kitob qilish mumkin, hisobotlar esa ochiq qoladi.", "Можно ли попробовать?": "Sinab ko'rish mumkinmi?", "Да — откройте": "Ha —", "демо-версию": "demo-versiyani", "прямо в браузере или оставьте заявку, и мы покажем программу.": "to'g'ridan-to'g'ri brauzerda oching yoki ariza qoldiring, dasturni ko'rsatamiz.", "Оставьте заявку": "Ariza qoldiring", "Перезвоним, ответим на вопросы и договоримся об установке.": "Qo'ng'iroq qilamiz, savollarga javob beramiz va o'rnatish haqida kelishamiz.", "Телефон для связи": "Aloqa uchun telefon", "Звоните или пишите в Telegram": "Qo'ng'iroq qiling yoki Telegram'da yozing", "✈ Написать в Telegram": "✈ Telegram'da yozish", "Ваше имя": "Ismingiz", "Телефон": "Telefon", "Название площадки (необязательно)": "Maydoncha nomi (ixtiyoriy)", "Комментарий (необязательно)": "Izoh (ixtiyoriy)", "Отправить заявку": "Arizani yuborish", "© PlayPos · Ташкент": "© PlayPos · Toshkent", "Демо-версия": "Demo-versiya", "Экран «Площадка»: список детей с таймерами и кнопками": "«Maydoncha» ekrani: taymerli bolalar ro'yxati", "Панель выхода ребёнка и оплаты": "Bola chiqishi va to'lov paneli", "Отчёты по кассирам и сменам": "Kassirlar va smenalar bo'yicha hisobotlar", "Настройка прав сотрудника": "Xodim huquqlarini sozlash", "Тарифы площадки": "Maydoncha tariflari", "Спасибо! Мы скоро вам перезвоним.": "Rahmat! Tez orada sizga qo'ng'iroq qilamiz.", "Нет связи. Позвоните нам по телефону.": "Aloqa yo'q. Bizga telefon orqali qo'ng'iroq qiling.", "Проверьте номер телефона": "Telefon raqamini tekshiring", "Слишком много заявок. Попробуйте позже или позвоните нам": "Arizalar juda ko'p. Keyinroq urinib ko'ring yoki bizga qo'ng'iroq qiling", "Установка": "O'rnatish", "Тариф возвращён": "Tarif qaytarildi", "Установка площадки": "Maydonchani o'rnatish",
    "Код установки": "O'rnatish kodi", "Название площадки": "Maydoncha nomi", "Имя владельца": "Egasining ismi", "Логин владельца (латиница)": "Egasining logini (lotin)",
    "Пароль (минимум 6 символов)": "Parol (kamida 6 belgi)", "Создать площадку": "Maydoncha yaratish", "Принтеры": "Printerlar", "↻ Обновить": "↻ Yangilash", "Настройки принтеров Windows": "Windows printer sozlamalari", "Чеки": "Cheklar", "Состояние": "Holat",
    "Выберите принтер для чеков и нажмите «Тестовый чек». Состояние обновляется само каждые 10 секунд. Новый принтер: подключите его, установите драйвер (бумага 80 мм, поля 0) и нажмите «Обновить».": "Cheklar uchun printerni tanlang va «Sinov cheki»ni bosing. Holat har 10 soniyada o'zi yangilanadi. Yangi printer: uni ulang, drayverni o'rnating (qog'oz 80 mm, chetlar 0) va «Yangilash»ni bosing.",
    "Принтер не выбран": "Printer tanlanmagan", "Принтер онлайн": "Printer onlayn", "Принтер офлайн": "Printer oflayn", "Онлайн": "Onlayn", "Онлайн · мало бумаги": "Onlayn · qog'oz kam",
    "Офлайн — проверьте кабель и питание": "Oflayn — kabel va quvvatni tekshiring", "Нет бумаги": "Qog'oz yo'q", "Нет тонера": "Toner yo'q", "Открыта крышка": "Qopqoq ochiq", "Замятие бумаги": "Qog'oz tiqilib qoldi",
    "Нужно обслуживание": "Xizmat ko'rsatish kerak", "Переполнен лоток": "Lotok to'lgan", "Виртуальный (не для чеков)": "Virtual (chek uchun emas)", "Состояние неизвестно": "Holat noma'lum",
    "Принтеры не найдены.": "Printerlar topilmadi.", "Подключите принтер, установите драйвер и нажмите «Обновить».": "Printerni ulang, drayverni o'rnating va «Yangilash»ni bosing.", "по умолчанию": "asosiy",
    "Тестовый чек отправлен на": "Sinov cheki yuborildi:", "Если он не вышел — проверьте бумагу и драйвер.": "Agar chiqmasa — qog'oz va drayverni tekshiring.", "Не удалось напечатать:": "Chop etib bo'lmadi:",
    "Принтер не найден в Windows": "Printer Windows'da topilmadi", "Чеки будут печататься на": "Cheklar shu printerda chop etiladi:", "Чек можно напечатать позже: «Счета» → «🖨 Чек».": "Chekni keyinroq chop etish mumkin: «Hisoblar» → «🖨 Chek».",
    "Если вы видите этот чек — принтер настроен правильно": "Bu chekni ko'rayotgan bo'lsangiz — printer to'g'ri sozlangan", "Один раз: создаём площадку и учётную запись владельца.": "Bir marta: maydoncha va egasining hisob qaydnomasi yaratiladi.", "Установка возможна только на компьютере кассы": "O'rnatish faqat kassa kompyuterida mumkin", "Неверный код установки": "O'rnatish kodi noto'g'ri",
    "Площадка уже создана — войдите под владельцем": "Maydoncha allaqachon yaratilgan — egasi sifatida kiring", "Готово! Открываем кассу…": "Tayyor! Kassa ochilmoqda…", "Для детских игровых площадок": "Bolalar o'yin maydonchalari uchun",
    "Каждая минута игры": "O'yinning har bir daqiqasi", "под контролем": "nazorat ostida",
    "PlayPos запускает таймер на ребёнка, подсвечивает тех, у кого время заканчивается, продлевает в один клик и сам пересчитывает сумму. Касса, смены, сотрудники и отчёты — в одном окне.": "PlayPos har bir bola uchun taymer ishga tushiradi, vaqti tugayotganlarni ajratib ko'rsatadi, bir bosishda uzaytiradi va summani o'zi qayta hisoblaydi. Kassa, smenalar, xodimlar va hisobotlar — bitta oynada.",
    "Попробовать демо →": "Demoni sinab ko'rish →", "Что умеет": "Nimalar qila oladi", "На площадке": "Maydonchada", "Вход в кассу": "Kassaga kirish", "Админ-панель": "Admin panel", "Выручка": "Tushum",
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
    ["placeholder", "title", "aria-label", "alt"].forEach((a) => { if (root.hasAttribute(a)) { const v = tr(root.getAttribute(a)); if (v !== root.getAttribute(a)) root.setAttribute(a, v); } });
    for (let n = root.firstChild; n; n = n.nextSibling) walk(n);
  }

  if (lang === "uz") {
    new MutationObserver((ms) => ms.forEach((m) => {
      if (m.type === "characterData") walk(m.target);
      else if (m.type === "attributes") walk(m.target);
      else m.addedNodes.forEach(walk);
    })).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["placeholder", "title", "aria-label", "alt"] });
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
