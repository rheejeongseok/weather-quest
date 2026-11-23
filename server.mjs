import {createServer} from 'node:http';
import handler from './core/handler.mjs';
createServer(handler).listen(Number(process.env.PORT)||3002,process.env.HOST||'0.0.0.0',()=>console.log('My Doc: http://localhost:'+ (process.env.PORT||3002)));
