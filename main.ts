#!/usr/bin/env node
import { program } from "commander";
import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';
import os from 'os';

// Configuration
const REGISTRY_URL = 'https://registry.mcpk.io';
const CONFIG_DIR = path.join(os.homedir(), '.mcpk');
const SERVERS_DIR = path.join(CONFIG_DIR, 'servers');
const RUNNING_SERVERS_FILE = path.join(CONFIG_DIR, 'running.json');

// Ensure configuration directories exist
if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
}
if (!fs.existsSync(SERVERS_DIR)) {
    fs.mkdirSync(SERVERS_DIR, { recursive: true });
}
if (!fs.existsSync(RUNNING_SERVERS_FILE)) {
    fs.writeFileSync(RUNNING_SERVERS_FILE, JSON.stringify({}, null, 2));
}

// Helper functions
function getRunningServers() {
    return JSON.parse(fs.readFileSync(RUNNING_SERVERS_FILE, 'utf8'));
}

function saveRunningServers(servers: object) {
    fs.writeFileSync(RUNNING_SERVERS_FILE, JSON.stringify(servers, null, 2));
}

function fetchServerInfo(serverName: string) {
    console.log(`Fetching information for ${serverName} from ${REGISTRY_URL}...`);
    // In a real implementation, this would make an HTTP request to the registry
    // This is a placeholder that simulates fetching server information

    const [scope, name] = serverName.split('/');
    return {
        name: serverName,
        command: 'npx',
        args: ['-y', serverName],
        description: `MCP Server for ${name}`,
        version: '1.0.0'
    };
}

function generateConfigExample(serverName: string, serverInfo) {
    const serverConfig = {
        [serverName.replace('@', '')]: {
            command: serverInfo.command,
            args: serverInfo.args
        }
    };

    const claudeConfig = JSON.stringify({
        "mcpServers": serverConfig
    }, null, 2);

    const libreConfig = `mcpServers:\n  ${serverName.replace('@', '')}:\n    command: ${serverInfo.command}\n    args:\n${serverInfo.args.map(arg => `      - ${arg}`).join('\n')}`;

    return {
        claude: claudeConfig,
        libre: libreConfig
    };
}

const CAULDE_CONFIG_PATH = process.env.MCPK_CLAUDE_CONFIG_PATH ||
    path.join(os.homedir(), '.config', 'claude', 'mcp-servers.json');

function updateClaudeConfig(serverName, serverInfo) {
    let config = {};
    if (fs.existsSync(CAULDE_CONFIG_PATH)) {
        config = JSON.parse(fs.readFileSync(CAULDE_CONFIG_PATH, 'utf8'));
    }

    config[serverName] = {
        endpoint: `http://localhost:${serverInfo.port || 3000}`,
        apiKey: serverInfo.apiKey || process.env.MCPK_DEFAULT_API_KEY,
        protocols: serverInfo.protocols || ['grpc', 'rest'],
        metadata: serverInfo.metadata || {}
    };

    fs.writeFileSync(CAULDE_CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log(`Updated Claude configuration at ${CAULDE_CONFIG_PATH}`);
}

// CLI commands
program
    .name('mcpk')
    .description('Command line tool for managing MCP servers')
    .version('1.0.0');

program
    .command('start <serverName>')
    .description('Start an MCP server')
    .action((serverName) => {
        const servers = getRunningServers();

        if (servers[serverName]) {
            console.log(`Server ${serverName} is already running (PID: ${servers[serverName].pid})`);
            return;
        }

        const serverInfo = fetchServerInfo(serverName);

        console.log(`Starting ${serverName}...`);
        const process = spawn(serverInfo.command, serverInfo.args, {
            detached: true,
            stdio: 'ignore'
        });

        process.unref();

        servers[serverName] = {
            pid: process.pid,
            startTime: new Date().toISOString(),
            info: serverInfo
        };

        saveRunningServers(servers);
        console.log(`Server ${serverName} started successfully (PID: ${process.pid})`);
    });

program
    .command('stop <serverName>')
    .description('Stop a running MCP server')
    .action((serverName) => {
        const servers = getRunningServers();

        if (!servers[serverName]) {
            console.log(`Server ${serverName} is not running`);
            return;
        }

        try {
            process.kill(servers[serverName].pid);
            delete servers[serverName];
            saveRunningServers(servers);
            console.log(`Server ${serverName} stopped successfully`);
        } catch (err) {
            console.error(`Failed to stop server ${serverName}: ${err.message}`);
        }
    });

program
    .command('status <serverName>')
    .description('Get the status of an MCP server')
    .action((serverName) => {
        const servers = getRunningServers();

        if (!servers[serverName]) {
            console.log(`Server ${serverName} is not running`);
            return;
        }

        const server = servers[serverName];
        console.log(`Server: ${serverName}`);
        console.log(`Status: Running`);
        console.log(`PID: ${server.pid}`);
        console.log(`Started: ${server.startTime}`);
        console.log(`Description: ${server.info.description}`);
        console.log(`Version: ${server.info.version}`);

        const configs = generateConfigExample(serverName, server.info);

        console.log('\nTo configure in Claude Desktop:');
        console.log('------------------------------');
        console.log('Edit your claude_desktop_config.json:');
        console.log(configs.claude);

        console.log('\nTo configure in LibreChat:');
        console.log('-------------------------');
        console.log('Add to your LibreChat YAML configuration:');
        console.log(configs.libre);
    });

program
    .command('list')
    .description('List all running MCP servers')
    .action(() => {
        const servers = getRunningServers();
        const serverNames = Object.keys(servers);

        if (serverNames.length === 0) {
            console.log('No MCP servers are currently running');
            return;
        }

        console.log('Running MCP Servers:');
        console.log('-------------------');

        serverNames.forEach(name => {
            const server = servers[name];
            console.log(`${name} (PID: ${server.pid}, Started: ${new Date(server.startTime).toLocaleString()})`);
        });
    });

program.parse();
