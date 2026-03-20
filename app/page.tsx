"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchCsrfToken } from "@/lib/client/csrf";
import { Button, Input } from "antd";
import {
  Store,
  Truck,
  ShoppingCart,
  Factory,
  ChevronDown,
  QrCode,
  CheckCircle,
  Shield,
  Zap,
  BarChart3,
  Users,
  Headphones,
} from "lucide-react";

export default function LandingPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Ошибка входа");
        return;
      }

      await fetchCsrfToken();
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Ошибка соединения с сервером");
    } finally {
      setLoading(false);
    }
  }

  const audienceCards = [
    {
      icon: <Store className="w-6 h-6" />,
      title: "Розничной торговле",
      description: "Управление магазинами, кассами, складом",
    },
    {
      icon: <Truck className="w-6 h-6" />,
      title: "Оптовой торговле",
      description: "Оптовые продажи, контрагенты, отсрочки",
    },
    {
      icon: <ShoppingCart className="w-6 h-6" />,
      title: "Онлайн-торговле",
      description: "Интеграция с маркетплейсами, сайтом",
    },
    {
      icon: <Factory className="w-6 h-6" />,
      title: "Производству",
      description: "Производство, сырьё, готовая продукция",
    },
  ];

  const benefits = [
    {
      icon: <CheckCircle className="w-8 h-8 text-[#1e6de5]" />,
      title: "Простой старт",
      description: "Настройка за 1 день без сложных внедрений",
    },
    {
      icon: <Shield className="w-8 h-8 text-[#1e6de5]" />,
      title: "Надёжность",
      description: "Облачная инфраструктура с резервным копированием",
    },
    {
      icon: <Zap className="w-8 h-8 text-[#1e6de5]" />,
      title: "Скорость работы",
      description: "Быстрый доступ к данным и отчётам",
    },
    {
      icon: <BarChart3 className="w-8 h-8 text-[#1e6de5]" />,
      title: "Аналитика",
      description: "Понятные отчёты для принятия решений",
    },
    {
      icon: <Users className="w-8 h-8 text-[#1e6de5]" />,
      title: "Команда",
      description: "Работа нескольких сотрудников в одной системе",
    },
    {
      icon: <Headphones className="w-8 h-8 text-[#1e6de5]" />,
      title: "Поддержка",
      description: "Техническая помощь и консультации",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Header */}
      <header className="border-b border-[#e2e8f0]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center">
              <img
                src="/oprix-logo.svg"
                alt="OPRIX"
                className="h-8 w-auto"
              />
            </div>

            {/* Navigation */}
            <nav className="hidden md:flex items-center space-x-8">
              <a
                href="#solutions"
                className="text-gray-700 hover:text-[#1e6de5] transition-colors"
              >
                Решения для бизнеса
              </a>
              <a
                href="#features"
                className="text-gray-700 hover:text-[#1e6de5] transition-colors"
              >
                Возможности
              </a>
              <a
                href="#pricing"
                className="text-gray-700 hover:text-[#1e6de5] transition-colors"
              >
                Тарифы
              </a>
              <a
                href="#support"
                className="text-gray-700 hover:text-[#1e6de5] transition-colors"
              >
                Поддержка
              </a>
              <a
                href="#marking"
                className="flex items-center gap-1 text-gray-700 hover:text-[#1e6de5] transition-colors"
              >
                <QrCode className="w-4 h-4" />
                Маркировка
              </a>
            </nav>

            {/* Mobile menu button */}
            <button className="md:hidden p-2">
              <ChevronDown className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="flex-1 py-16 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left: Text */}
            <div>
              <h1 className="text-4xl lg:text-5xl font-bold text-gray-900 leading-tight mb-6">
                ERP-система для управления бизнесом
              </h1>
              <p className="text-lg text-gray-600 mb-8">
                OPRIX помогает автоматизировать торговлю, склад, финансы и
                производство. Всё необходимое для роста вашего бизнеса в одной
                системе.
              </p>

              {/* Audience Cards */}
              <div className="grid sm:grid-cols-2 gap-4">
                {audienceCards.map((card, index) => (
                  <div
                    key={index}
                    className="p-4 border border-[#e2e8f0] rounded-lg hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-[#f8fafc] rounded-md text-[#1e6de5]">
                        {card.icon}
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {card.title}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {card.description}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Login Form */}
            <div className="lg:pl-8">
              <div className="bg-white border border-[#e2e8f0] rounded-lg p-8 shadow-sm">
                <div className="text-center mb-6">
                  <img
                    src="/oprix-logo.svg"
                    alt="OPRIX"
                    className="h-12 w-auto mx-auto mb-4"
                  />
                  <h2 className="text-xl font-semibold text-gray-900">
                    Вход в систему
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Введите данные для доступа к ERP
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Логин
                    </label>
                    <Input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Введите логин"
                      required
                      autoFocus
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Пароль
                    </label>
                    <Input.Password
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Введите пароль"
                      required
                      className="w-full"
                    />
                  </div>

                  {error && (
                    <p className="text-sm text-red-600 bg-red-50 p-2 rounded">
                      {error}
                    </p>
                  )}

                  <Button
                    type="primary"
                    htmlType="submit"
                    className="w-full"
                    loading={loading}
                    style={{
                      backgroundColor: "#1e6de5",
                      borderColor: "#1e6de5",
                    }}
                  >
                    {loading ? "Вход..." : "Войти"}
                  </Button>
                </form>

                <div className="mt-6 text-center text-sm text-gray-500">
                  <p>Нет аккаунта? Обратитесь к администратору</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section id="features" className="py-16 bg-[#f8fafc]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Почему выбирают OPRIX
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Современная ERP-система, которая адаптируется под ваш бизнес
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {benefits.map((benefit, index) => (
              <div
                key={index}
                className="bg-white p-6 rounded-lg border border-[#e2e8f0] hover:shadow-md transition-shadow"
              >
                <div className="mb-4">{benefit.icon}</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {benefit.title}
                </h3>
                <p className="text-gray-600">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-[#e2e8f0] py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <img
                src="/oprix-logo.svg"
                alt="OPRIX"
                className="h-6 w-auto"
              />
            </div>
            <p className="text-sm text-gray-500">
              © 2026 OPRIX ERP. Все права защищены.
            </p>
            <div className="flex items-center gap-6">
              <a
                href="#"
                className="text-sm text-gray-500 hover:text-[#1e6de5] transition-colors"
              >
                Политика конфиденциальности
              </a>
              <a
                href="#"
                className="text-sm text-gray-500 hover:text-[#1e6de5] transition-colors"
              >
                Условия использования
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
