import childProcess, { ChildProcessWithoutNullStreams } from 'child_process';
import os from 'os';
import path from 'path';

import Telegraf, { ContextMessageUpdate, Telegram } from 'telegraf';

import { instance as config } from './config';
import logger from './logger';

let internalBuffer = '';
const detector = (botTelegram: Telegram) => {
  const lines = internalBuffer.split('\n');
  if (lines.length === 1) return;
  for (let i = 0; i < lines.length - 1; i++) {
    let target = null;
    if (lines[i].match(/^\[.* INFO\] Server started\.\r?$/)) {
      logger.info('Server start detect!');
      botTelegram.sendMessage(config.get('telegramBotChatroomId'), config.get('serverStartMessage'));
    } else if ((target = lines[i].match(/^\[.* INFO\] Player connected: (.+), xuid: \d+\r?$/))) {
      botTelegram.sendMessage(config.get('telegramBotChatroomId'), config.get('joinMessage').replace('{0}', target[1]));
    } else if ((target = lines[i].match(/^\[.* INFO\] Player disconnected: (.+), xuid: \d+\r?$/))) {
      botTelegram.sendMessage(config.get('telegramBotChatroomId'), config.get('leaveMessage').replace('{0}', target[1]));
    }
  }
  internalBuffer = lines[lines.length - 1];
  return;
}

const startServer = (botTelegram: Telegram) => {
  let cOs = config.get('osDetect');
  if (cOs === 'auto') {
    logger.debug('OS auto detecting...');
    cOs = os.platform() === 'win32' ? 'win32' : 'linux';
  }

  const serverPath = path.resolve(config.get('serverPath'));

  let server: ChildProcessWithoutNullStreams|null = null;
  if (cOs === 'win32') {
    // OS logging
    logger.info('Platform: win32');

    // Path for server executable
    const serverExe = path.join(serverPath, 'bedrock_server.exe');
    logger.debug(`Server executable at: ${ serverExe }`);

    // Spawn server
    logger.info('Server spawning...');
    server = childProcess.spawn(serverExe, {
      cwd: serverPath
    });
  } else {
    // OS logging
    cOs = 'linux';
    logger.info('Platfrom: linux');

    // Path for server executable
    const serverExe = path.join(serverPath, 'bedrock_server');
    logger.debug(`Server executable at: ${ serverExe }`);

    // Spawn server
    logger.info('Server spawning...');
    server = childProcess.spawn(serverExe, {
      cwd: serverPath,
      env: {
        'LD_LIBRARY_PATH': '.',
      }
    });
  }

  server.stdout.on('data', data => {
    process.stdout.write(data);
    internalBuffer += data.toString();
    detector(botTelegram);
  });

  server.stderr.on('data', data => {
    process.stderr.write(data);
    logger.error(data.toString());
  });
  
  server.on('close', (code) => {
    logger[code === 0 ? 'info' : 'error'](`Server process exited with code ${code}`);
    //process.exit(0);
  });
}

config.init().then(() => {
  const bot: Telegraf<ContextMessageUpdate> = new Telegraf(config.get('telegramBotToken'));
  bot.command('getChatroomId', (ctx: ContextMessageUpdate) => {
    if (ctx.chat) {
      ctx.reply('This chatroom id: ' + ctx.chat.id);
    } else {
      ctx.reply('Unknown id chatroom :/');
    }
  });
  bot.launch();
  startServer(bot.telegram);
}).catch(err => {
  logger.error(err);
  logger.error('UNEXPECTED CONFIG ERROR');
});
