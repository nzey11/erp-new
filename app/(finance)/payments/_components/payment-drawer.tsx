"use client";

import { useEffect } from "react";
import { Drawer, Form, Input, Select, DatePicker, InputNumber, Button, Space } from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import type { PaymentWithRelations } from "@/lib/domain/payments/queries";

const { TextArea } = Input;

export type PaymentDrawerMode = "create" | "edit";

interface PaymentDrawerProps {
  open: boolean;
  mode: PaymentDrawerMode;
  payment: PaymentWithRelations | null;
  onClose: () => void;
  onSubmit: (values: PaymentFormValues) => Promise<void>;
  loading?: boolean;
}

/**
 * PaymentFormValues — plain-object shape safe for Server Action boundary.
 * `date` is an ISO string (not Dayjs) so Next.js can serialize it.
 */
export interface PaymentFormValues {
  type: "income" | "expense";
  categoryId: string;
  counterpartyId?: string;
  amount: number;
  paymentMethod: "cash" | "bank_transfer" | "card";
  /** ISO 8601 string — converted from Dayjs before crossing Server Action boundary */
  date: string;
  description?: string;
}

/** Internal form shape — Dayjs is fine inside the client component */
interface PaymentFormFields {
  type: "income" | "expense";
  categoryId: string;
  counterpartyId?: string;
  amount: number;
  paymentMethod: "cash" | "bank_transfer" | "card";
  date: Dayjs;
  description?: string;
}

/**
 * Payment Drawer — controlled component for Create/Edit operations.
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
export function PaymentDrawer({
  open,
  mode,
  payment,
  onClose,
  onSubmit,
  loading,
}: PaymentDrawerProps) {
  const [form] = Form.useForm<PaymentFormFields>();

  // Pre-fill form when editing
  useEffect(() => {
    if (open && mode === "edit" && payment) {
      form.setFieldsValue({
        type: payment.type as "income" | "expense",
        categoryId: payment.category?.id || "",
        counterpartyId: payment.counterparty?.id,
        amount: Number(payment.amount),
        paymentMethod: payment.paymentMethod as "cash" | "bank_transfer" | "card",
        date: dayjs(payment.date),
        description: payment.description || undefined,
      });
    } else if (open && mode === "create") {
      form.resetFields();
      form.setFieldsValue({
        date: dayjs(),
        type: "expense",
        paymentMethod: "bank_transfer",
      });
    }
  }, [open, mode, payment, form]);

  const handleSubmit = async () => {
    const fields = await form.validateFields();
    // Convert Dayjs → ISO string before crossing the Server Action boundary.
    // Dayjs objects have a toJSON method and cannot be serialized by Next.js RSC.
    const values: PaymentFormValues = {
      ...fields,
      date: fields.date?.toISOString() ?? new Date().toISOString(),
    };
    await onSubmit(values);
  };

  const handleClose = () => {
    form.resetFields();
    onClose();
  };

  const title = mode === "create" ? "Новый платёж" : "Редактирование платежа";

  return (
    <Drawer
      title={title}
      open={open}
      onClose={handleClose}
      size="middle"
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
          name="type"
          label="Тип платежа"
          rules={[{ required: true, message: "Выберите тип" }]}
        >
          <Select
            options={[
              { value: "income", label: "Приход" },
              { value: "expense", label: "Расход" },
            ]}
          />
        </Form.Item>

        <Form.Item
          name="date"
          label="Дата"
          rules={[{ required: true, message: "Выберите дату" }]}
        >
          <DatePicker format="DD.MM.YYYY" style={{ width: "100%" }} />
        </Form.Item>

        <Form.Item
          name="amount"
          label="Сумма"
          rules={[{ required: true, message: "Введите сумму" }]}
        >
          <InputNumber
            style={{ width: "100%" }}
            min={0.01}
            step={0.01}
            precision={2}
            formatter={(value) =>
              value
                ? new Intl.NumberFormat("ru-RU", {
                    minimumFractionDigits: 2,
                  }).format(Number(value))
                : ""
            }
          />
        </Form.Item>

        <Form.Item
          name="categoryId"
          label="Категория"
          rules={[{ required: true, message: "Выберите категорию" }]}
        >
          <Select
            placeholder="Выберите категорию"
            options={[]} // Will be populated from API/categories
          />
        </Form.Item>

        <Form.Item name="counterpartyId" label="Контрагент">
          <Select
            placeholder="Выберите контрагента"
            allowClear
            options={[]} // Will be populated from API/counterparties
          />
        </Form.Item>

        <Form.Item
          name="paymentMethod"
          label="Способ оплаты"
          rules={[{ required: true, message: "Выберите способ оплаты" }]}
        >
          <Select
            options={[
              { value: "cash", label: "Наличные" },
              { value: "bank_transfer", label: "Банковский перевод" },
              { value: "card", label: "Карта" },
            ]}
          />
        </Form.Item>

        <Form.Item name="description" label="Описание">
          <TextArea rows={3} placeholder="Дополнительная информация..." />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
