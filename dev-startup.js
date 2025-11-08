#!/usr/bin/env node
const { spawn, exec } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const process = require('process');

const projectRoot = process.cwd();
const isWindows = os.platform() === 'win32';
const isMac = os.platform() === 'darwin';
const isLinux = os.platform() === 'linux';

const http = require('http'); // lmao
const SERVER_URL = 'http://184.58.146.190:5100';
const SERVER_TIMEOUT = 5000; // 5 seconds

function checkServerAccessibility() {
  return new Promise((resolve) => {
    console.log(`\n[SERVER CHECK] Testing connection to: ${SERVER_URL}`);
    
    const req = http.request(SERVER_URL, { method: 'HEAD', timeout: SERVER_TIMEOUT }, (res) => {
      console.log(`Server is accessible (Status: ${res.statusCode})`);
      resolve(true);
    });

    req.on('error', (error) => {
      console.log(`Server is not accessible: ${error.message}`);
      console.log('The app may not work properly without the server');
      resolve(false);
    });

    req.on('timeout', () => {
      console.log('Server connection timed out');
      console.log('The app may not work properly without the server');
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

// Figure out what terminal the linux user defends with their life
function getLinuxTerminal() {
  const terminals = [
    { cmd: 'st', args: (cmdStr) => ['-e', 'sh', '-c', cmdStr] },
    { cmd: 'gnome-terminal', args: (cmdStr) => ['--', 'bash', '-c', cmdStr] },
    { cmd: 'konsole', args: (cmdStr) => ['-e', 'bash', '-c', cmdStr] },
    { cmd: 'xfce4-terminal', args: (cmdStr) => ['-e', cmdStr] },
    { cmd: 'xterm', args: (cmdStr) => ['-e', 'bash', '-c', cmdStr] },
  ];
  
  for (const term of terminals) {
    try {
      require('child_process').execSync(`which ${term.cmd}`, { stdio: 'ignore' });
      console.log(`Found terminal: ${term.cmd}`);
      return term;
    } catch (e) {
      // Terminal not found, try next
    }
  }
  
  console.error('No supported terminal found on Linux!');
  console.error('Please install one of: st, gnome-terminal, konsole, xfce4-terminal, or xterm');
  process.exit(1);
}

const linuxTerminal = isLinux ? getLinuxTerminal() : null;

// Only 2 processes to run, bulder and run android
const processes = [
  {
    name: 'Metro Bundler',
    cwd: path.join(projectRoot, 'NodeMobile'),
    command: isWindows ? 'npx.cmd' : 'npx',
    args: ['react-native', 'start'],
  },
  {
    name: 'Android Build',
    cwd: path.join(projectRoot, 'NodeMobile'),
    command: isWindows ? 'npx.cmd' : 'npx',
    args: ['react-native', 'run-android'],
  },
];

const runningProcesses = [];

// Function to spawn a process in a new terminal
function spawnInTerminal(processInfo) {
  const { name, cwd, command, args } = processInfo;
  
  console.log(`\n[STARTUP] Launching "${name}"...`);
  
  if (isWindows) {
    // Windows: Use cmd /k to keep terminal open
    const cmdString = `cd /d "${cwd}" && ${command} ${args.join(' ')}`;
    exec(`start cmd.exe /k "${cmdString}"`, (error) => {
      if (error) console.error(`Error launching ${name}:`, error);
    });
  } else if (isMac) {
    // macOS: Use open -a Terminal
    const cmdString = `cd "${cwd}" && ${command} ${args.join(' ')}`;
    exec(`open -a Terminal "${cmdString}"`, (error) => {
      if (error) console.error(`Error launching ${name}:`, error);
    });
  } else if (isLinux) {
    const cmdString = `cd "${cwd}" && ${command} ${args.join(' ')}; exec bash`;
    const termArgs = linuxTerminal.args(cmdString);
    
    spawn(linuxTerminal.cmd, termArgs, {
      stdio: 'inherit',
      detached: true,
    });
  }
  
  runningProcesses.push({ name, cwd });
}

// Main startup sequence
async function startup() {
  console.log('========================================');
  console.log('  React Native Dev Environment');
  console.log('========================================');
  console.log(`Platform: ${os.platform()}`);
  console.log(`Project Root: ${projectRoot}`);
  console.log('========================================\n');
  
  // Check if server is accessible 
  const isServerAccessible = await checkServerAccessibility();

  // Validate NodeMobile directory exists
  const nodeMobileDir = path.join(projectRoot, 'NodeMobile');
  if (!fs.existsSync(nodeMobileDir)) {
    console.error(`Directory not found: ${nodeMobileDir}`);
    process.exit(1);
  }
  
  console.log('NodeMobile directory found\n');
  
  // Launch Metro Bundler first
  console.log('Launching Metro Bundler...');
  spawnInTerminal(processes[0]);
  
  // Wait 5 seconds for Metro to start up
  console.log('Waiting for Metro to start (5 seconds)...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Then launch Android build
  console.log('Launching Android build...');
  spawnInTerminal(processes[1]);
  
  console.log('\n========================================');
  console.log('Both processes launched!');
  console.log('========================================');
  console.log(`\nServer: ${isServerAccessible ? 'Accessible' : 'Not accessible'}`);
  console.log('\nRunning in background. Press Ctrl+C to exit this launcher.');
  console.log('\nTerminal windows:');
  console.log('  1. Metro Bundler (React Native dev server)');
  console.log('  2. Android Build (App running on device/emulator)');
  console.log('\nClose terminal windows manually to stop processes.\n');
}

// Cleanup on exit
process.on('SIGINT', () => {
  console.log('\n\n========================================');
  console.log('  Shutting down launcher...');
  console.log('========================================\n');
  
  runningProcesses.forEach(proc => {
    console.log(`Launched: ${proc.name}`);
  });
  
  console.log('\nNote: Terminal windows were launched separately.');
  console.log('Close them manually or they will continue running.\n');

  process.exit(0);
});

// Start
startup().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});