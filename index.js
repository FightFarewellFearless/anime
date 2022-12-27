// anti crash

process.on('uncaughtException', (error, origin) => {
    console.log('----- Uncaught exception -----')
    console.log(error)
    console.log('----- Exception origin -----')
    console.log(origin)
})

process.on('unhandledRejection', (reason, promise) => {
    console.log('----- Unhandled Rejection at -----')
    console.log(promise)
    console.log('----- Reason -----')
    console.log(reason)
})

// end of anti crash

const fs = require('fs');
const crypto = require('crypto');
const { EventEmitter } = require('events');

const event = new EventEmitter();

const { newAnime, fromUrl, getDownloadURL, searchAnime, BASE_URL } = require('./scraper.js');
const ratelimiter = require('rate-limiter-flexible');
const session = require('express-session');
const captcha = require('captcha-canvas');
const captchaData = {};
const webpush = require('web-push');
webpush.setVapidDetails('mailto:' + process.env.mail, process.env.publicKey, process.env.privateKey)
// const cookieParser = require("cookie-parser");
require('dotenv').config();

console.log('Cleaning up...');
fs.readdirSync('./downloaded').forEach(z => {
    fs.unlinkSync('./downloaded/' + z)
})

console.log('Setting up...');
// setup

const meatdb = require('meatdb');
const db = new meatdb({
    encrypt: true,
    encoding: 'hex',
    encryptionKey: process.env.key,
    salt: process.env.salt,
    iv: 'kPaosNM,amj990h./(*5'
});

const maxLoginTry = 5;
const adminLoginRateLimit = new ratelimiter.RateLimiterMemory({
    points: maxLoginTry,
    keyPrefix: 'loginfail',
    duration: 60 * 5, // save the data for 5 minutes
    blockDuration: 60 * 10 // block for 10 minutes
})

const maxrequest = 100;
const requestLimit = new ratelimiter.RateLimiterMemory({
    points: maxrequest,
    keyPrefix: 'requestlimit',
    duration: 15, // 15 seconds
    blockDuration: 15 * 60 // 15 minutes
}) // so, it will limit all requests to 100 requests per 15 seconds

// end of setup
console.log('Getting new anime before starting the server..');
newAnime().then(async (animeData) => {
    // log

    let log = (await db.get('log')).value;
    if (log == undefined) {
        log = [];
        db.set('log', [])
    }

    // end of log
    const downqueue = [];
    const { default: axios } = await import('axios');
    if (animeData.length !== 0) {
        checkNewAnime((await db.get('animeData')).value, animeData)
        await db.set('animeData', animeData);
    }
    let subsdata = (await db.get('subsdata')).value;
    if (subsdata == undefined) {
        await db.set('subsdata', []);
    }
    subsdata = [];
    const express = require('express');
    // const cors = require('cors');
    const ejs = require('ejs');
    const bodyParser = require('body-parser');

    const app = express();
    app.use(require('serve-favicon')(__dirname + '/assets/favicon.ico'))


    // !!!!! security stuff  !!!!!

    // app.use(require('helmet')());
    app.set('trust proxy', true);
    app.disable('x-powered-by');

    app.use(async (req, res, next) => {
        const userLimit = await requestLimit.get(req.ip);
        if (userLimit != null && userLimit.consumedPoints > maxrequest) {
            res.socket.destroy();
        } else {
            try {
                await requestLimit.consume(req.ip);
                next();
            }
            catch (e) {
                if (!(e instanceof Error)) {
                    res.set('Retry-After', String(Math.round(userLimit.msBeforeNext / 1000) || 1));
                    res.status(429).send('You have reach request limit, you will be blocked for 15 minutes');
                }
            }
        }
    })

    app.use(async (req, res, next) => {
        if (req.originalUrl.startsWith('/assets')) return next();;
        log.push({
            useragent: req.headers['user-agent'],
            date: Date.now(),
            path: req.originalUrl
        });
        db.set('log', log);
        next();
    })

    // !!!!! end of security stuff !!!!!

    // session and cookie
    // app.use(cookieParser());
    const twoHours = 1000 * 60 * 60 * 2;
    app.use(session({
        secret: '86f106ecfae1d686a020d1b1cec56d729e1af5fbf3fa20c3baf0c777a1025eccf15a04cf30ead8a39cebc41b239d4836960370e400eebd6b07ff0d297e8e3e78',
        saveUninitialized: true,
        cookie: { maxAge: twoHours, secure: 'auto' },
        resave: false,
        name: 'sessionID'
    }));

    app.engine('ejs', ejs.renderFile);

    // app.use(cors());
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: false }));
    app.use(require('hpp')())
    // Admin stuffs

    app.get('/admin', async (req, res) => {
        if (req.session.isAdmin) {
            res.render(__dirname + '/views/admin.ejs', {
                isMaintenance: (await db.get('isMaintenance')).value,
                deniedDownload: (await db.get('deniedDownload')).value,
                downloadDirSize: await downloadDirSize(),
                downloadFileLength: (await fs.promises.readdir('./downloaded/')).length
            });
        }
        else {
            const {image, text} = captcha.createCaptcha();
            const captchaID = await new Promise(res => crypto.randomBytes(10, (er, buf) => res(buf.toString('hex'))));
            captchaData[captchaID] = text.toLowerCase();
            setTimeout(() => {
                delete captchaData[captchaID]
            }, 120_000 /** 2 minutes */)
            res.render(__dirname + '/views/adminLogin.ejs', {
                error: req.query.error == 'true',
                captcha: (await image).toString('base64'),
                captchaID
            });
        }
    })
    app.post('/admin/login', async (req, res) => {
        const userRateLimit = await adminLoginRateLimit.get(req.ip);
        if (userRateLimit != null && userRateLimit.consumedPoints > maxLoginTry) {
            const retryAfterInSec = Math.round(userRateLimit.msBeforeNext / 1000) || 1;
            res.set('Retry-After', String(retryAfterInSec));
            res.status(429).render(__dirname + '/views/adminBlock.ejs');
            return;
        };

        if (req.body.psw === process.env.token && req.body.captcha != undefined && captchaData[req.body.captchaID] != undefined && req.body.captcha.toLowerCase() === captchaData[req.body.captchaID]) {
            if (userRateLimit != null && userRateLimit.consumedPoints > 0) await adminLoginRateLimit.delete(req.ip);;
            delete captchaData[req.body.captchaID];
            req.session.isAdmin = true;
            res.redirect('/admin');
        } else {
            try {
                await adminLoginRateLimit.consume(req.ip);
                res.status(401);
                res.redirect('/admin?error=true')
            } catch (e) {
                if (!(e instanceof Error)) {
                    const retryAfterInSec = Math.round(userRateLimit.msBeforeNext / 1000) || 1;
                    res.set('Retry-After', String(retryAfterInSec));
                    res.status(429).render(__dirname + '/views/adminBlock.ejs');
                }
            }
        }
    })
    app.post('/admin/setmaintenance', async (req, res) => {
        const isMaintenance = req.body.m == true;
        if (req.session.isAdmin) {
            await db.set('isMaintenance', isMaintenance);
            res.send('success')
        }
        else {
            res.status(401);
            res.send('Unauthorized');
        }
    })
    app.post('/admin/setdennydownload', async (req, res) => {
        const isDenied = req.body.m == true;
        if (req.session.isAdmin) {
            await db.set('deniedDownload', isDenied);
            res.send('success')
        }
        else {
            res.status(401);
            res.send('Unauthorized');
        }
    })

    app.post('/admin/sendnotif', async (req, res) => {
        if (req.session.isAdmin) {
            const subs = (await db.get('subsdata')).value;
            if (subs == undefined) return;;
            await Promise.all(subs.map(async subscription => {
                const payload = {
                    title: "Pemberitahuan!",
                    body: req.body.text
                };
                await webpush.sendNotification(subscription, JSON.stringify(payload))
            }))
            res.send('success')
        }
        else {
            res.status(401);
            res.send('Unauthorized');
        }
    })

    app.get('/admin/log', async (req, res) => {
        if (req.session.isAdmin) {
            res.render(__dirname + '/views/admin-log.ejs', {
                log: (await db.get('log')).value
            })
        }
        else {
            res.status(401);
            res.send('Unauthorized');
        }
    })

    app.post('/admin/resetlog', async (req, res) => {
        if (req.session.isAdmin) {
            log = [];
            await db.set('log', log);
            res.send('success')
        }
        else {
            res.status(401);
            res.send('Unauthorized');
        }
    })

    // End of Admin stuffs

    app.use(async (req, res, next) => {
        const isMaintenance = (await db.get('isMaintenance')).value;
        if (isMaintenance && !req.session.isAdmin) {
            res.status(503).render(__dirname + '/views/maintenance.ejs');
        }
        else next()
    })

    app.get('/', async (req, res) => {
        const latestAnime = (await db.get('animeData')).value;
        res.render(__dirname + '/views/main.ejs', { latestAnime })
    })

    // app.get('/watch/:title', async (req, res) => {
    //     const latestAnime = (await db.get('animeData')).value;
    //     const title = decodeURIComponent(req.params.title);
    //     const data = latestAnime.find(z => z.title == title);
    //     const url = data?.streamingLink;
    //     const download = data?.downloadLink;
    //     const Animetitle = data?.title;
    //     // console.log(title, url, download)
    //     res.render(__dirname + '/views/watch.ejs', { url, download, title: Animetitle })
    // })

    // app.post('/getDLLink', async (req, res) => {
    //     const deniedDownload = (await db.get('deniedDownload')).value
    //     if (deniedDownload === true) return res.send('denied');;
    //     const url = req.body.url;
    //     const title = req.body.title;
    //     const link = await getDownloadURL(url);
    //     if (link == undefined) return res.send('null');;
    //     if ((await downloadDirSize()) > 800) return res.send('out of space');;
    //     if (downqueue.length >= 4) return res.send('out of queue');;
    //     const filename = Date.now();
    //     db.set(filename.toString(), title + '.mp4');
    //     downqueue.push(0)
    //     const stream = fs.createWriteStream('./downloaded/' + filename)
    //     const downloaded = await axios({
    //         method: 'get',
    //         url: link,
    //         responseType: 'stream'
    //     })
    //     downloaded.data.pipe(stream);
    //     await new Promise(res => {
    //         stream.on('close', res)
    //     })
    //     res.send('/download?file=' + filename);;
    //     setTimeout(() => {
    //         fs.promises.unlink(__dirname + '/downloaded/' + filename)
    //     }, 480_000)
    //     downqueue.pop();
    // })

    // app.get('/download', async (req, res) => {
    //     const realname = await db.get(req.query.file);
    //     res.download(__dirname + '/downloaded/' + req.query.file, realname.value);
    //     db.delete(req.query.file);
    // })

    app.get('/search', async (req, res) => {
        const query = req.query.q;
        if (query === undefined) return res.render(__dirname + '/views/tidakDidukung.ejs');
        const search = await searchAnime(query);
        res.render(__dirname + '/views/search.ejs', { search, query })
    })
    // app.get('/searchresulttemp', async (req, res) => {
    //     let link = req.query.r;
    //     if (link.startsWith('/')) link = BASE_URL + link.replace('/', '');

    //     res.render(__dirname + '/views/searchResultTemp.ejs', { link })
    // })
    app.get('/watch', async (req, res) => {
        let link = req.query.r;
        if(link != undefined) {
            link = Buffer.from(link, 'base64').toString();
        }
        if (link?.startsWith('/')) link = BASE_URL + link?.replace('/', '');
        const data = await fromUrl(link);
        // console.log(data.genre);
        if (data?.genre.toString().toLowerCase().includes('ecchi')) {
            res.render(__dirname + '/views/noEcchi.ejs');
            return;
        }
        if (data?.type == 'singleEps') {
            const url = data?.streamingLink;
            const download = data?.downloadLink;
            const title = data?.title;
            // console.log(title, url, download)
            res.render(__dirname + '/views/watch.ejs', { title, url, download })
        }
        else if (data?.type == 'epsList') {
            res.render(__dirname + '/views/fullSeason.ejs', { data })
        }
        else {
            res.render(__dirname + '/views/tidakDidukung.ejs');
        }
    })

    // app.post('/getStreamLink', async (req, res) => {
    //     const link = req.body.rawLink;
    //     const stream = await getParseStreamingLink(link);
    //     res.send(stream)
    // })

    app.get('/assets/:file', async (req, res) => {
        res.sendFile(__dirname + '/assets/' + req.params.file);
    })

    // Notification

    app.post('/subscribeNotification', async (req, res) => {
        const subs = req.body;
        subsdata.push(subs);
        db.set('subsdata', subsdata);
        res.status(201).json({});
    })

    app.post('/unsubscribeNotification', async (req, res) => {
        const subs = req.body;
        subsdata = subsdata.filter(a => {
            return JSON.stringify(a) !== JSON.stringify(subs);
        });
        db.set('subsdata', subsdata);
        res.status(201).json({});
    })

    async function checkNewAnime(last, latest) {
        if (last == undefined) return;;
        const latestPublished = latest.filter((x) => {
            return last.find(z => z.title === x.title) == undefined;
        });
        latestPublished.forEach(async z => {
            const subs = (await db.get('subsdata')).value;
            if (subs == undefined) return;;
            subs.forEach(async subscription => {
                const payload = {
                    title: "Anime baru telah rilis!",
                    body: z.title + ' ' + z.episode
                };
                webpush.sendNotification(subscription, JSON.stringify(payload)).catch((err) => {
                    console.error('webpush.sendNotification failed with reason:', err)
                })
            })
        })
    }

    // app.get('/notiftest', async (req, res) => {
    //     const subs = (await db.get('subsdata')).value;
    //     if (subs == undefined) return;;
    //     subs.forEach(async subscription => {
    //         const payload = {
    //             title: "Test notif",
    //             body: 'Testing'
    //         };
    //         webpush.sendNotification(subscription, JSON.stringify(payload))
    //     })
    //     res.send('ok')
    // })

    // End of Notification

    app.get('/noscript', async (req, res) => {
        res.render(__dirname + '/views/noscript.ejs')
    })

    app.get('/ip', async (req, res) => {
        res.send(req.ip)
    })

    // 404 not found
    app.get('*', async (req, res) => {
        res.status(404).render(__dirname + '/views/404.ejs')
    })

    app.listen(Number(process.env.port));
    console.log('listening to ' + Number(process.env.port))
    setInterval(() => {
        newAnime().then(async (animeData) => {
            if (animeData.length !== 0) {
                checkNewAnime((await db.get('animeData')).value, animeData)
                await db.set('animeData', animeData);
            }
        })
    }, 40000)
})

async function downloadDirSize() {
    const fileInDir = await fs.promises.readdir('./downloaded/');
    let size = 0;
    for (const file of fileInDir) {
        const thisFileSize = (await fs.promises.stat('./downloaded/' + file)).size;
        size += thisFileSize;
    }
    return size / (1024 * 1024); //return the size in megabytes
}