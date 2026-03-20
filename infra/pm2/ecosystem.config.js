module.exports = {
  apps: [
    {
      name: "listopt-erp",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      cwd: "/var/www/listopt-erp/current",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        // Required secrets — set actual values on the server or via CI/CD secrets
        // DATABASE_URL: "postgresql://user:pass@localhost:5432/listopt_erp",
        // SESSION_SECRET: "your-64-char-random-hex-secret",
      },
    },
  ],
};
