const cheerio = require('cheerio')
const { axios } = require('v-axios')
const iconv = require('iconv-lite')
const fs = require('fs-extra')

async function getPage (url) {
  const res = await axios.get(url, {
    responseType: 'stream'
  }).catch(e => {
    console.error(e)
  })

  const html = await new Promise((resolve) => {
    const chunks = []

    res.data.on('data', (chunk) => {
      chunks.push(chunk)
    })

    res.data.on('end', () => {
      const buffer = Buffer.concat(chunks)
      const html = iconv.decode(buffer, 'gb2312')

      resolve(html)
    })
  })

  return html
}

(async () => {
  const cityIds = []
  const rs = {
    86: {}
  }
  const level0 = await getPage('http://www.stats.gov.cn/tjsj/tjbz/tjyqhdmhcxhfdm/2019/index.html')
  const $ = cheerio.load(level0)
  const list = $('.provincetr td a')
  const urls = []

  list.each((index, el) => {
    const url = `http://www.stats.gov.cn/tjsj/tjbz/tjyqhdmhcxhfdm/2019/${$(el).attr('href')}`
    const data = {
      id: $(el).attr('href').split('.')[0] + '0000',
      name: $(el).text()
    }
    rs['86'][data.id] = data.name
    urls.push(url)
  })

  // 市
  for (const url of urls) {
    const level1 = await getPage(url)
    const $ = cheerio.load(level1, { decodeEntities: false })
    const list = $('.citytr td a')
    const countyUrls = []
    list.each(async (index, el) => {
      const url = `http://www.stats.gov.cn/tjsj/tjbz/tjyqhdmhcxhfdm/2019/${$(el).attr('href')}`
      // filter number
      const text = $(el).text()
      if (!/\d+/.test(text)) {
        const data = {
          id: $(el).attr('href').split('.')[0].slice(3) + '00',
          name: $(el).text()
        }

        const parentId = data.id.slice(0, 2) + '0000'

        if (data.name !== '市辖区') {
          if (!rs[parentId]) {
            rs[parentId] = {}
          }
          cityIds.push(data.id)
          rs[parentId][data.id] = data.name
        }
      }
      countyUrls.push(url)
    })

    for (const url of countyUrls) {
      const level2 = await getPage(url)
      const $ = cheerio.load(level2, { decodeEntities: false })
      const list = $('.countytr td, .towntr td')

      const districtUrls = []
      list.each(async (index, el) => {
        const link = $(el).find('a')
        let data = {}
        if (link.length) {
          if (!/\d+/.test($(el).text())) {
            data = {
              id: $(link[0]).attr('href').split('.')[0].split('/')[1],
              name: $(el).text()
            }
          }
        } else {
          if (!/\d+/.test($(el).text())) {
            data = {
              id: $(list[index - 1])
                .text()
                .replace(/0+$/g, ''),
              name: $(el).text()
            }
          }
        }

        if (data.id) {
          const parentId = data.id.slice(0, 4) + '00'

          if (data.name !== '市辖区') {
            if (!rs[parentId]) {
              rs[parentId] = {}
            }
            rs[parentId][data.id] = data.name

            const tmpUrl = url.split(parentId.slice(0, 4) + '.html')[0]
            const href = $(link).attr('href')
            const url_ = href ? (tmpUrl + `${$(link).attr('href')}`) : ''
            console.log(url_)

            if (!districtUrls.includes(url_) && url_) {
              districtUrls.push(url_)
            }
          }
        }
      })

      for (const url of districtUrls) {
        const level2 = await getPage(url)
        const $ = cheerio.load(level2, { decodeEntities: false })

        const list = $('table .towntable .towntr')

        list.each(async (index, el) => {
          const tdList = $(el).find('td')
          const data = {}

          tdList.each(async (index, el) => {
            if (index === 0) {
              data.id = $(el).text()
            } else {
              data.name = $(el).text()
            }
          })

          if (data.id) {
            const parentId = data.id.slice(0, 6)

            if (data.name !== '市辖区') {
              if (!rs[parentId]) {
                rs[parentId] = {}
              }
              rs[parentId][data.id] = data.name
            }
          }
        })
      }
    }
  }

  fs.writeFileSync('./data.json', JSON.stringify(rs, null, 2))
  console.log('done')
})()
