# Navigation Callback Matrix

| Surface | Label | Callback/Command | Expected Screen |
|---|---|---|---|
| Main menu | `✅ Сегодня (отметить)` | `action_today_checklist` | Today execution checklist |
| Main menu | `📋 План и задачи` | `action_plan_view` | Planning view for current date |
| Main menu | `🎯 Текущий спринт` | `action_current_sprint` | Active sprint card |
| Main menu | `🚀 Новый спринт` | `action_new_sprint` | Sprint onboarding |
| Main menu | `📊 Аналитика` | `action_analytics` | Progress screen |
| Main menu | `📊 Метрики` | `action_metrics` | Monthly goal metrics |
| Main menu | `🧾 Review` | `action_review` | Quarterly review |
| Main menu | `🗓 Недельный разбор` | `action_weekly_review` | Unfinished week review |
| Main menu | `💡 Помощь` | `action_help_overview` | Short help screen |
| Main menu | `⚙️ Настройки` | `action_settings` | Settings screen |
| Reply keyboard | `📋 Добавить задачи` | text hears | Date picker for adding tasks |
| Reply keyboard | `🌙 Закрыть день` | text hears | Day close flow |
| Reply keyboard | `🎯 Спринты` | text hears | Sprints list |
| Reply keyboard | `🏠 Меню` | text hears | Main menu keyboard |
| Slash | `/plan` | command | Planning flow |
| Slash | `/today` | command | Today checklist |
| Slash | `/close` | command | Day close flow |
