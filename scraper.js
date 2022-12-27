const cheerio = require('cheerio');
const jsdom = require('jsdom');
const fs = require('fs');
const BASE_DOMAIN = 'nanimex.in';
const BASE_URL = 'https://' + BASE_DOMAIN;
const newAnime = async () => {
    const { default: axios } = await import('axios');
    const { data: html } = await axios.get(BASE_URL, {
        headers: {
            "Accept-Encoding": "*"
        }
    });
    const $ = cheerio.load(html);
    const links = [];
    const data = [];
    $('div.box-body.box-poster').eq(0).find('.col-sm-3.content-item').each((i, el) => {
        links.push($(el))
    });
    for (const _link of links) {
        const link = _link.find('a').attr('href');
        const title = _link.find('h3').attr('title');
        const episode = _link.find('.episode > .label.btn-danger').text().trim();
        const thumbnailUrl = _link.find('img').attr('data-lazy-src');
        data.push({
            title,
            episode,
            thumbnailUrl,
            streamingLink: link
        })
    }
    return data
}

const searchAnime = async (name) => {
    const { default: axios } = await import('axios');
    const { data: searchdata } = await axios.get(BASE_URL + '/?s=' + name, {
        headers: {
            "Accept-Encoding": "*"
        }
    }).catch(() => { });
    const $ = cheerio.load(searchdata);
    const result = [];
    $('div.box-body.box-poster').eq(0).find('.col-sm-3.content-item').each((i, el) => {
        const title = $(el).find('a').attr('title');
        const animeUrl = $(el).find('a').attr('href');
        const thumbnailUrl = $(el).find('img').attr('src');
        result.push({
            title,
            animeUrl,
            thumbnailUrl
        })
    });
    return result
}

const getDownloadURL = async (_DLLink, html = undefined) => {
    const { default: axios } = await import('axios');
    let DLLink = _DLLink;
    let basedownloadDomain = DLLink?.split('/')[2];
    if (basedownloadDomain?.includes('mirrored')) {
        try {
            const mirror1 = (await axios.get(_DLLink, {
                headers: {
                    "Accept-Encoding": "*"
                }
            })).data;
            const m1 = cheerio.load(mirror1);
            const mirror2Link = m1('.col-sm.centered.extra-top').find('a').attr('href');
            const mirror2 = (await axios.get(mirror2Link, {
                headers: {
                    "Accept-Encoding": "*"
                }
            })).data;
            const m3Link = 'https://' + basedownloadDomain + mirror2.split('ajaxRequest.open("GET", "')[1].split('", true)')[0];
            const mirror3 = (await axios.get(m3Link, {
                headers: {
                    "Accept-Encoding": "*"
                }
            })).data;
            const m3 = cheerio.load(mirror3);
            const zippyLinkRaw = 'https://' + basedownloadDomain + m3('tbody > tr').filter((i, el) => {
                return m3(el).find('img').attr('alt').toLowerCase().trim().includes('zippy')
            }).find('a').attr('href');
            const mirror4 = (await axios.get(zippyLinkRaw, {
                headers: {
                    "Accept-Encoding": "*"
                }
            })).data;
            const m4 = cheerio.load(mirror4);
            DLLink = m4('div.row').eq(1).find('a').attr('href');
            basedownloadDomain = DLLink?.split('/')[2];
        } catch (e) {
            console.error(e);
            return undefined;
        }
    }
    if (!html) {
        try {
            const { data: downloaddata } = await axios.get(DLLink, {
                headers: {
                    "Accept-Encoding": "*"
                }
            });
            const virtualConsole = new jsdom.VirtualConsole();
            virtualConsole.on("error", () => { });
            virtualConsole.on("warn", () => { });
            virtualConsole.on("info", () => { });
            virtualConsole.on("dir", () => { });
            const dom = new jsdom.JSDOM(downloaddata, { runScripts: 'dangerously', virtualConsole });
            const downloadLink = dom.window.document.getElementById('dlbutton')?.getAttribute('href');
            if (downloadLink == undefined) return undefined
            return 'https://' + basedownloadDomain + downloadLink
        }
        catch (e) {
            console.error(e)
            return undefined
        }
    }
    else {
        try {
            const virtualConsole = new jsdom.VirtualConsole();
            virtualConsole.on("error", () => { });
            virtualConsole.on("warn", () => { });
            virtualConsole.on("info", () => { });
            virtualConsole.on("dir", () => { });
            const dom = new jsdom.JSDOM(html, { runScripts: 'dangerously', virtualConsole });
            const downloadLink = dom.window.document.getElementById('dlbutton')?.getAttribute('href');
            if (downloadLink == undefined) return undefined
            return 'https://' + basedownloadDomain + downloadLink
        }
        catch {
            return undefined
        }
    }

}

const fromUrl = async (url) => {
    const { default: axios } = await import('axios');
    const _axios = await axios.get(url, {
        headers: {
            "Accept-Encoding": "*"
        }
    }).catch(() => { });
    const data = _axios?.data;
    if (data == undefined) return;
    const $ = cheerio.load(data);
    const isEpsList = $('#change-server').length === 0;
    let genreIndex;
    $('.table.table-condensed').eq(0).find('tbody > tr > td').each((i, el) => {
        if ($(el).text().trim() === 'Genre') {
            genreIndex = i + 1;
        }
    })
    const genre = [];
    $('.table.table-condensed').eq(0).find('tbody > tr > td').eq(genreIndex).find('a').each((i, el) => {
        genre.push($(el).text().trim())
    })
    if (isEpsList) {
        const eps = $('.box-body.episode_list').eq(0);
        const results = [];
        eps.find('tr > td').each((i, el) => {
            const epslist = $(el);
            results.push({
                link: epslist.find('a').attr('href'),
                episode: epslist.find('a').text().trim()
            })
        });
        return {
            type: 'epsList',
            title: $('.box-title').eq(1).text().trim(),
            synopsys: $('.attachment-text').text().trim(),
            episodeList: results,
            genre
        }
    }
    else {
        const streamingLink = $('#change-server > option').eq(0).attr('value');
        const downloadLink = $('.box-body.episode_list > div').find('a').filter((i, el) => {
            const text = $(el).text().trim().toLowerCase();
            return text.includes('480p') && text.includes('uservideo.xyz');
        }).attr('href');
        return {
            type: 'singleEps',
            title: $('li.active').text().trim(),
            streamingLink,
            downloadLink,
            getDownloadURL: async () => {
                return await getDownloadURL(downloadLink);
            },
            genre
        }
    }
}

module.exports = {
    BASE_URL,
    newAnime,
    getDownloadURL,
    searchAnime,
    fromUrl
}