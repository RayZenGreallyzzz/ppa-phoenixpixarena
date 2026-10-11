# PPA Telegram ↔ Godot: безопасное включение чтения NPC

**СТАТУС: тестовый план. НИЧЕГО НЕ РАЗВЁРНУТО И НЕ ВКЛЮЧЕНО В PRODUCTION.**
Изменения находятся в черновом серверном PR #34. Godot-клиент — в черновом PR #33.

## Контракт

Один исходный сейв Telegram PPA и одна D1-база. У Godot нет отдельной экономики.
Владелец определяется строго сервером через Phoenix game session → Phoenix account → Telegram ID, а не параметром запроса.
Ответ NPC содержит ownerId, gameId, version, readOnly:true, service и data.actionsEnabled:false.
Godot отбрасывает ответы другого владельца, старой сессии или старого сервера без ownerId.
Персональный Black Market читает только неистёкшие предложения сохранения; количество уже купленных товаров берётся из blackMarket.bought[id]. Если записи нет, остаток лимита неизвестен. Новых лотов и продаж нет.
Комиссия аукциона 10%, серверные выплаты и существующий Telegram-клиент не меняются.

## Флаги: все по умолчанию выключены

| Данные | Для отдельной проверки чтения | Оставить выключенным |
| --- | --- | --- |
| Общий сейв | PPA_GODOT_STATE_READ_ENABLED=1 | Запись D1 |
| Все 9 NPC | PPA_GODOT_NPC_READ_ENABLED=1 + флаг сейва | Любые действия NPC |
| Торговец | PPA_MERCHANT_READ_ENABLED=1 | PPA_MERCHANT_ACTIONS_ENABLED |
| Кузница | PPA_FORGE_READ_ENABLED=1 | PPA_FORGE_ACTIONS_ENABLED, PPA_FORGE_ENHANCE_ENABLED |
| Экипировка | PPA_INVENTORY_READ_ENABLED=1 | PPA_INVENTORY_ACTIONS_ENABLED |
| Личный склад | PPA_PERSONAL_STORAGE_READ_ENABLED=1 | PPA_PERSONAL_STORAGE_ACTIONS_ENABLED |
| Кланы | PPA_GODOT_CLAN_READ_ENABLED=1 | PPA_GODOT_CLAN_ACTIONS_ENABLED |
| Клановый склад | PPA_CLAN_STORAGE_READ_ENABLED=1 | PPA_CLAN_STORAGE_ACTIONS_ENABLED |
| Аукцион | PPA_AUCTION_READ_ENABLED=1 | PPA_AUCTION_ACTIONS_ENABLED, PPA_AUCTION_SERVER_CREDIT_CLAIM_ENABLED |

**Для просмотра NPC нужны только два первых флага**, а не одновременное включение всех остальных сервисов.
Ни один флаг действий или реального боя не входит в этот этап.

## Порядок проверки до любых изменений Cloudflare

1. Проверить зелёные CI на текущих HEAD PR #34 и #33.
   Node: tools/test-native-npc-readonly.mjs и tools/test-native-npc-rollout-matrix.mjs.
   Второй тест имитирует двух владельцев, девять NPC, просроченные лоты и восемь заблокированных POST-команд без изменения сейва.
   Это тест с синтетическими данными, а НЕ реальная Cloudflare D1 интеграция.
2. Создать отдельный защищённый staging Worker, привязанный только к изолированной обезличенной копии D1. НЕ подключать staging к production D1. Проверить резервную копию и план отката.
3. Лишь в staging включить PPA_GODOT_STATE_READ_ENABLED=1 и PPA_GODOT_NPC_READ_ENABLED=1. На двух тестовых аккаунтах сверить D1-сейв, баланс, вещи +7, сумку 100 ячеек, руны, склад, арену и персональные Black Market лимиты с Telegram PPA.
4. При переключении игроков и токенов во время запроса убедиться, что чужие данные не показываются. Все POST-маршруты покупки, заточки, складов, клана, аукциона должны оставаться недоступны. Ни одна запись сейва или аукционных кредитов не должна изменяться.
5. Проверить установленную APK с сохранением package ID и подписи, производительность и старый Telegram WebView. Не публиковать приватные сейвы или bearer-токены в журналах.
6. Только после отдельного явного разрешения владельца — обсудить production-бэкап, выпуск Worker и поочерёдное включение флагов ТОЛЬКО ЧТЕНИЯ. При любой ошибке — выключить новые read-флаги, откатить Worker без изменения D1.

## Всё ещё не подтверждено

Реальный staging Worker с изолированной D1, два одновременных реальных клиента Telegram/Godot, старые кешированные Telegram-клиенты, безопасный cutover аукционных выплат. Эти этапы — отдельные блокеры, а не повод включать все функции одним деплоем.

См. также docs/ppa-auction-credit-cutover.md. **Никаких merge, deploy, продажи и выплаты без разрешения.**
