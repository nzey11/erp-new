SELECT type, "paymentMethod", COUNT(*) FROM "Payment" GROUP BY 1, 2;
SELECT COUNT(*) as total FROM "Payment";
SELECT MIN(date), MAX(date) FROM "Payment";
