module.exports = {
  apps: [
    {
      name: 'mario-backend',
      cwd: './backend',
      script: 'npm',
      args: 'run start:dev',
      autorestart: true,
      max_restarts: 50,
      restart_delay: 3000,
      watch: false,
      env: {
        NODE_ENV: 'development',
        PORT: 3001,
      },
    },
    {
      name: 'mario-frontend',
      cwd: './frontend',
      script: 'npm',
      args: 'run dev -- -p 3002',
      autorestart: true,
      max_restarts: 50,
      restart_delay: 3000,
      watch: false,
      env: {
        NODE_ENV: 'development',
      },
    },
    {
      name: 'mario-tunnel',
      script: process.env.HOME + '/.local/bin/cloudflared',
      args: 'tunnel --url http://localhost:3002',
      autorestart: true,
      max_restarts: 100,
      restart_delay: 5000,
      watch: false,
    },
  ],
};
