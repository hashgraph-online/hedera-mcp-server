module.exports = {
  apps: [
    {
      name: 'mcp-server',
      script: './dist/index.js',
      cwd: '/app',
      instances: 1,
      exec_mode: 'fork',
      env: {
        PORT: 3000,
        API_PORT: 3002
      },
      error_file: '/app/logs/mcp-error.log',
      out_file: '/app/logs/mcp-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '500M'
    },
    {
      name: 'admin-portal',
      script: './server.js',
      cwd: '/app/admin-portal',
      instances: 1,
      exec_mode: 'fork',
      env: {
        PORT: 3001,
        HOSTNAME: '0.0.0.0'
      },
      error_file: '/app/logs/admin-error.log',
      out_file: '/app/logs/admin-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '300M'
    }
  ]
};