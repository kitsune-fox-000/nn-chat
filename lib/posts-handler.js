'use strict';
const pug = require('pug');
const Cookies = require('cookies');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ log: [ 'query' ] });
const { currentThemeKey } = require('../config');
const crypto = require('node:crypto');
const util = require('./handler-util');

// 1回の投稿で送れる最大文字数(画面側の maxlength と同じ値にする)
const MAX_CONTENT_LENGTH = 500;

const oneTimeTokenMap = new Map(); // キーをユーザ名、値をトークンとする連想配列

async function handle(req, res) {
  const cookies = new Cookies(req, res);
  const currentTheme = cookies.get(currentThemeKey) || 'light';
  const options = { maxAge: 30 * 86400 * 1000 };
  cookies.set(currentThemeKey, currentTheme, options);
  switch (req.method) {
    case 'GET':
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "default-src 'self'; script-src https://* http://localhost:8000/; style-src https://* http://localhost:8000/; font-src https://*;"
      })
      const posts = await prisma.post.findMany({
        orderBy: {
          id: 'asc'
        },
        include: { likes: true } // 各投稿のいいねも一緒に取得する
      });
      const oneTimeToken = crypto.randomBytes(8).toString('hex');
      oneTimeTokenMap.set(req.user, oneTimeToken);
      res.end(pug.renderFile('./views/posts.pug', {
        currentTheme,
        posts,
        user: req.user,
        oneTimeToken
      }));
    console.info(
      `閲覧されました: user: ${req.user}, ` +
      `remoteAddress: ${req.socket.remoteAddress}, ` +
      `userAgent: ${req.headers['user-agent']} `
    )
      break;
    case 'POST':
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      }).on('end', async () => {
        const params = new URLSearchParams(body);
        const content = params.get('content');
        const requestedOneTimeToken = params.get('oneTimeToken');
        if(!content) {
          handleRedirectPosts(req, res);
          return;
        }
        if(!requestedOneTimeToken) {
          util.handleBadRequest(req, res);
          return;
        }
        if(oneTimeTokenMap.get(req.user) !== requestedOneTimeToken) {
          util.handleBadRequest(req, res);
          return;
        }
        // 改行は、ブラウザからは \r\n で届くので、1文字(\n)として数える
        if(content.replace(/\r\n/g, '\n').length > MAX_CONTENT_LENGTH) {
          util.handleBadRequest(req, res);
          return;
        }
        console.info(`送信されました: ${content}`);
        await prisma.post.create({
          data: {
            content,
            postedBy: req.user
          }
        });
        oneTimeTokenMap.delete(req.user);
        handleRedirectPosts(req, res);
      });
      break;
    default:
      break;
  }
}

function handleRedirectPosts(req, res) {
  res.writeHead(303, {
    'Location': '/posts'
  });
  res.end();
}

function handleDelete(req, res) {
  switch (req.method) {
    case 'POST':
      let body ='';
      req.on('data' ,(chunk) => {
        body += chunk;
      }).on('end', async () => {
        const params = new URLSearchParams(body);
        const id =parseInt(params.get('id'));
        const post = await prisma.post.findUnique({
          where: { id }
        });
        if (!post) {
          util.handleBadRequest(req, res);
          return;
        }
        if (req.user === post.postedBy || req.user === 'admin') {
          await prisma.post.delete({
            where: { id }
          });
          handleRedirectPosts(req, res);
        } else {
          // 他人の投稿は消せない(応答しないと、ブラウザが待ち続けてしまう)
          util.handleBadRequest(req, res);
        }
      });
      break;
      default:
        util.handleBadRequest(req, res);
        break;
  }
}

// いいねを付ける / 外す(すでに付けていたら外す)
function handleLike(req, res) {
  switch (req.method) {
    case 'POST':
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      }).on('end', async () => {
        const params = new URLSearchParams(body);
        const postId = parseInt(params.get('id'));
        if (Number.isNaN(postId)) {
          util.handleBadRequest(req, res);
          return;
        }
        const post = await prisma.post.findUnique({
          where: { id: postId }
        });
        if (!post) {
          util.handleBadRequest(req, res);
          return;
        }
        // postId と user の組み合わせで、1件を特定する
        const where = { postId_user: { postId, user: req.user } };
        const alreadyLiked = await prisma.like.findUnique({ where });
        if (alreadyLiked) {
          await prisma.like.delete({ where });
        } else {
          await prisma.like.create({
            data: { postId, user: req.user }
          });
        }
        handleRedirectPosts(req, res);
      });
      break;
    default:
      util.handleBadRequest(req, res);
      break;
  }
}

module.exports = {
  handle,
  handleDelete,
  handleLike,
};