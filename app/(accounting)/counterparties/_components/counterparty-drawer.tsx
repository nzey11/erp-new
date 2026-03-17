"use client";

import { useEffect } from "react";
import {
  Drawer,
  Form,
  Input,
  Select,
  Switch,
  Button,
  Space,
  Divider,
} from "antd";
import type { CounterpartyWithBalance } from "@/lib/domain/counterparties/queries";
import type { CounterpartyType } from "@/lib/domain/counterparties/parse-filters";

const { TextArea } = Input;

export type CounterpartyDrawerMode = "create" | "edit";

interface CounterpartyDrawerProps {
  open: boolean;
  mode: CounterpartyDrawerMode;
  counterparty: CounterpartyWithBalance | null;
  onClose: () => void;
  onSubmit: (values: CounterpartyFormValues) => Promise<void>;
  loading?: boolean;
}

export interface CounterpartyFormValues {
  name: string;
  legalName?: string;
  type: CounterpartyType;
  inn?: string;
  phone?: string;
  email?: string;
  contactPerson?: string;
  isActive: boolean;
}

const TYPE_OPTIONS = [
  { value: "customer", label: "Покупатель" },
  { value: "supplier", label: "Поставщик" },
  { value: "both", label: "Покупатель/Поставщик" },
];

/**
 * Counterparty Drawer — controlled component for Create/Edit operations.
 *
 * Responsibilities:
 * - Render form with antd components
 * - Handle form validation
 * - Call onSubmit with normalized values
 * - Reset form on close
 *
 * NOT responsible for:
 * - Data fetching
 * - Server mutations
 * - Navigation
 * - Message notifications
 */
export function CounterpartyDrawer({
  open,
  mode,
  counterparty,
  onClose,
  onSubmit,
  loading,
}: CounterpartyDrawerProps) {
  const [form] = Form.useForm<CounterpartyFormValues>();

  // Pre-fill form when editing
  useEffect(() => {
    if (open && mode === "edit" && counterparty) {
      form.setFieldsValue({
        name: counterparty.name,
        legalName: counterparty.legalName || undefined,
        type: counterparty.type,
        inn: counterparty.inn || undefined,
        phone: counterparty.phone || undefined,
        email: counterparty.email || undefined,
        contactPerson: counterparty.contactPerson || undefined,
        isActive: counterparty.isActive,
      });
    } else if (open && mode === "create") {
      form.resetFields();
      form.setFieldsValue({
        type: "customer",
        isActive: true,
      });
    }
  }, [open, mode, counterparty, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    await onSubmit(values);
  };

  const handleClose = () => {
    form.resetFields();
    onClose();
  };

  const title =
    mode === "create" ? "Новый контрагент" : "Редактирование контрагента";

  return (
    <Drawer
      title={title}
      open={open}
      onClose={handleClose}
      size="large"
      footer={
        <Space className="flex justify-end">
          <Button onClick={handleClose}>Отмена</Button>
          <Button type="primary" onClick={handleSubmit} loading={loading}>
            {mode === "create" ? "Создать" : "Сохранить"}
          </Button>
        </Space>
      }
    >
      <Form
        form={form}
        layout="vertical"
        disabled={loading}
        onFinish={handleSubmit}
      >
        <Form.Item
          name="name"
          label="Название"
          rules={[{ required: true, message: "Введите название контрагента" }]}
        >
          <Input placeholder="ООО Ромашка" />
        </Form.Item>

        <Form.Item name="legalName" label="Юридическое название">
          <Input placeholder="Общество с ограниченной ответственностью Ромашка" />
        </Form.Item>

        <Form.Item
          name="type"
          label="Тип"
          rules={[{ required: true, message: "Выберите тип контрагента" }]}
        >
          <Select options={TYPE_OPTIONS} />
        </Form.Item>

        <Divider>Контактная информация</Divider>

        <Form.Item name="inn" label="ИНН">
          <Input placeholder="7707083893" maxLength={12} />
        </Form.Item>

        <Form.Item name="phone" label="Телефон">
          <Input placeholder="+7 (999) 123-45-67" />
        </Form.Item>

        <Form.Item
          name="email"
          label="Email"
          rules={[{ type: "email", message: "Введите корректный email" }]}
        >
          <Input placeholder="info@example.com" />
        </Form.Item>

        <Form.Item name="contactPerson" label="Контактное лицо">
          <Input placeholder="Иванов Иван Иванович" />
        </Form.Item>

        <Form.Item name="isActive" valuePropName="checked">
          <Switch checkedChildren="Активен" unCheckedChildren="Неактивен" />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
