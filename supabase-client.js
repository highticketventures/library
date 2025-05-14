// supabase-client.js
(function() {
  // URL к вашей Netlify функции, которая будет предоставлять ключ (добавим позже)
  const AUTH_URL =
    "https://ваш-netlify-app.netlify.app/.netlify/functions/get-supabase-key";

  // Инициализация клиента после получения ключа
  async function initSupabaseClient() {
    try {
      // Получаем ключ с сервера Netlify
      const response = await fetch(AUTH_URL);
      if (!response.ok) {
        throw new Error("Не удалось получить ключ авторизации");
      }

      const { supabaseUrl, supabaseKey } = await response.json();

      // Инициализируем Supabase клиент
      const supabase = supabaseClient(supabaseUrl, supabaseKey);

      // Сохраняем экземпляр клиента в глобальную переменную
      window.supabaseInstance = supabase;

      // Вызываем событие для оповещения о готовности клиента
      window.dispatchEvent(new CustomEvent("supabaseReady"));

      return supabase;
    } catch (error) {
      console.error("Ошибка инициализации Supabase:", error);
      throw error;
    }
  }

  // Функция для создания Supabase клиента
  function supabaseClient(supabaseUrl, supabaseKey) {
    // Создание клиента с использованием CDN-библиотеки Supabase
    return supabase.createClient(supabaseUrl, supabaseKey);
  }

  // Экспорт API для использования на Webflow
  window.SupabaseAPI = {
    init: initSupabaseClient,

    // Метод ожидания готовности клиента
    onReady: function(callback) {
      if (window.supabaseInstance) {
        callback(window.supabaseInstance);
      } else {
        window.addEventListener("supabaseReady", () => {
          callback(window.supabaseInstance);
        });
      }
    },

    // Пример метода для получения данных
    getItems: async function(table, options = {}) {
      return await this.onReady(async (supabase) => {
        let query = supabase.from(table).select(options.select || "*");

        if (options.orderBy) {
          query = query.order(options.orderBy, {
            ascending: options.ascending !== false,
          });
        }

        return await query;
      });
    },

    // Добавьте другие методы по необходимости
  };

  // Автоматическая инициализация при загрузке страницы
  document.addEventListener("DOMContentLoaded", () => {
    window.SupabaseAPI.init().catch((err) => {
      console.error("Не удалось инициализировать Supabase:", err);
    });
  });
})();
