import { parse } from 'node-html-parser';
import moment from 'moment';
import utils from './utils.js';
import mongo from './mongo.js';
import request from 'sync-request';
import webdriver, { By } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import { ConsoleLogEntry } from 'selenium-webdriver/bidi/logEntries.js';
// import { until } from 'selenium-webdriver';
import chromedriver from './chromedriver.js';
import gpt from './gpt.js';

//import yahooFinance from 'yahoo-finance';

import yahooFinance from 'yahoo-finance2';


const yahoo = {
  chunck_size: 13500,

  symbols_with_bars: async function(minBarsNum=0) {
    const db = await mongo.connect()
    if(minBarsNum == 0)
      return db.collection('bar').distinct('symbol');

    return db.collection('bar').aggregate([
      { $group: { _id: '$symbol', count: { $sum: 1 } } },
      { $match: { count: { $gt: minBarsNum } } },
      { $project: { _id: 1 } }
    ]).toArray();
  },

  // STATS
  load_symbol_stats: async function(symbol) { 
    function extract(trs, text_) {
      for(const tr of trs) {
        const td0 = tr.getElementsByTagName('td')[0]
        const text = td0.querySelector('span').childNodes[0]._rawText
        //console.log("text:", text)
        if(text == text_) {
          const td1 = tr.getElementsByTagName('td')[1]
          return td1.childNodes[0]._rawText
        }
        
      }
     //return parseFloat(td.childNodes[0]._rawText)
    }
    const db = await mongo.connect()
    const url = `https://finance.yahoo.com/quote/${symbol}/key-statistics?p=${symbol}}`
    const res = utils.fetch(url)
    if(res.err) {
      console.log("yahoo load_symbol_stats error:", res.err)
      return false
    }
    try {
      const root = parse(res.data)
      const div = root.querySelector('#Col1-0-KeyStatistics-Proxy')
      const trs = div.getElementsByTagName('tr')
      const forwardPER = parseFloat(extract(trs, 'Forward P/E'))
      let priceSales = parseFloat(extract(trs, 'Price/Sales'))
      // roa might not end with % ( N/A )
      let roa = extract(trs, 'Return on Assets')
      if(!!roa && roa.endsWith("%")) 
        roa = roa.slice(0, -1)
      roa = parseFloat(roa)
    const { modifiedCount } = await db.collection('security').updateOne( {_id: symbol }, { $set: { forwardPER, priceSales, roa} } )
    } catch(err) {
      console.log("Error for:", symbol)
      return false
    }
    return true
  },

  load_all_symbol_stats: async function() {
    const db = await mongo.connect()
    const symbols = await db.collection('security').find( { forwardPER: { $exists : false } }, { sort: { _id: 1 } } ).limit( this.chunck_size ).toArray()
    let count = 1
    for(const symbol of symbols) {
      console.log(`load_all_symbol_stats symbol(${count}): '${symbol._id}'`)
      const res = await this.load_symbol_stats(symbol._id)
      //if(!res) break
      await utils.sleep(500)
      count++
    }
  },

  // PROFILE
  load_symbol_profile: async function(symbol) {
    const db = await mongo.connect()
    const url = `https://finance.yahoo.com/quote/${symbol}/profile?p=${symbol}`
    const res = utils.fetch(url)
    if(res.err) {
      console.log("yahoo load_symbol_sector error:", res.err)
      return false
    } 
    const root = parse(res.data)
    const div = root.querySelector('.asset-profile-container')
    if(!div) {
      await db.collection('log').insertOne( { descp: `${symbol} Not Found on yahoo`, code: 10, status:0, symbol, created: new Date() } )
      console.log(`${symbol} Not found -------------------------------------------------------------`)
      return false
    }
    const h3 = div.querySelector('h3')
    if(!h3 || !h3.childNodes) {
      console.log("")
      return false
    }
    const name = h3.childNodes[0]._rawText
    if(!name) {
      return false
    }
    const p = div.getElementsByTagName('p')[1]
    const spans = p.getElementsByTagName('span')
    let sector = 'N/A'
    let industry = 'N/A'
    try {
      const span_sector = spans[1]
      sector = span_sector.childNodes[0]._rawText
      const span_industry = spans[3]
      industry = span_industry.childNodes[0]._rawText
    } catch(err) {
    }
    const { modifiedCount } = await db.collection('security').updateOne( {_id: symbol }, { $set: { name, sector, industry} }, { upsert: true } )

    return true
  },

  load_all_symbol_profiles: async function() {
    const db = await mongo.connect()
    const symbols = await db.collection('security').find( { sector: { $exists : false } }, { sort: { _id: 1 } } ).limit( this.chunck_size ).toArray()
    const logs = await db.collection('log').find( { } ).toArray()
    const notFounds = logs.map( r => r.symbol)
    for(const symbol of symbols) {
      const notFound = notFounds.find( (el, i, arr) => el == symbol._id)
      if(!!notFound) continue

      console.log("load_all_symbol_profiles symbol:", symbol._id)
      const res = await this.load_symbol_profile(symbol._id)
      //if(!res) break
      await utils.sleep(800)
    }
  },



  // for each sectors computes low & high per threshold
  compute_sector_per_thresholds: async function() {
    const sector_per = {}
    const db = await mongo.connect()
    const all_sectors = await db.collection('security').aggregate([
      {$group : {_id:"$sector", count:{$sum:1}}}]).toArray()
    //console.log("sectors:", all_sectors)
    const sectors = all_sectors.filter(s => s._id != 'N/A' && s._id != 'Services')
    for(const sector of sectors) {
      const sector_symbols = await db.collection('security').find({ per: { $gt: 0 },  sector: sector._id } ).toArray()
      sector_symbols.sort((a, b) => a.per - b.per);
      //console.log("sector_symbols:", sector._id, sector_symbols)
      const count = sector_symbols.length
      const low_threshold = parseInt(count / 10 )
      const high_threshold = parseInt(count * 9 / 10 )
      sector_per[sector._id] = { low_threshold, high_threshold }      
    }
    //console.log("sector_per:", this.sector_per)
    return sector_per
  },

  acceptCookies: true,

  fetch_news: async function(urls) {
    // read text between parentheses
    const regex = /\(([^)]+)\)/g;
    const db = await mongo.connect()
    //const sectors = await this.compute_sector_per_thresholds()
    const last_news = await db.collection('last_news').find( {  } ).toArray()
      //options.addArguments('--headless')
    let driver

    const companies_w_news = []
    try { // server: chromedriver
      driver = chromedriver.get()
      for(const url of urls) {
        console.log(`rl: ${url}`)
        await driver.get(url)
        //await driver.manage().addCookie({ name: "PRF", value:  "txxxxxx'});
        //await driver.wait(until.elementLocated(By.name('agree')));
        if(this.acceptCookies) {
          try {
            const button = await driver.wait(webdriver.until.elementLocated(By.name('agree')), 5000);
            if(!!button)
              button.click();
          } catch (error) {
              console.log('agree Element not found within 5 seconds');
          }        
          this.acceptCookies = false
        }
        await utils.sleep(3000)
        // Wait for the page to load and the JavaScript to execute
        // Get the HTML content of the page after the JavaScript has executed
        const html = await driver.getPageSource()
        const root = parse(html)
        const div = root.querySelector('#Main')
        const lis = div.querySelectorAll('li')
        // each li is a piece of news.
        let firstNews = true
        for(const li of lis) {
          const a = li.querySelector('a')
          const href = a.getAttribute('href')
          const found = last_news.find( (elem,i, arr) => href == elem.href && url == elem.url) 
          if(!!found) {
            //console.log("News already processed:", href)
            break
          }
          const a_text = a.textContent
          // read text in parentehses
          const matches = a_text.match(regex);
          if(!matches || !matches.length) continue
          let symbol = matches[0].slice(1, -1)
          if(!!symbol.includes(":"))
            symbol = symbol.split(':')[1]
          // update last href for this url
          if(!!firstNews)  {
            await db.collection('last_news').updateOne( { url }, { $set: { href } }, { upsert: true } )
            console.log("updating last_news for ", url)
            firstNews = false
          }

          // stop looking if href has been already processes
          const security = await db.collection('security').findOne( { _id: symbol } )
          if(!security) continue
          // process news.
          const news_url = `finance.yahoo.com${href}`
            let news_text = await this.extract_news(driver, news_url)
            news_text = utils.cutText(news_text, 5000)
            if(!news_text || news_text.length < 300) continue
            console.log(`news length: ${news_text.length}`)
            let analysis = await gpt.analyze_news(symbol, news_text)
            console.log(`analysis:" ${analysis}`)
            //const sector = sectors[security.sector]
            //if(security.per > sector.high_threshold || security.per < sector.low_threshold) {
              //let sentido = 'Per bajo. La noticia es util si es POSITIVA'
              //if(security.per > sector.high_threshold)
                //sentido = 'Per alto. La noticia es util si es NEGATIVA'

            const { impact, summary, reason } = analysis
            if( ['positive', 'negative'].includes(impact)) {
              companies_w_news.push( { symbol, url: news_url, impact, summary: news_text, reason } ) // ??? remove news_text
              console.log(`news:, ${news_url}. Impact: ${analysis.impact}`)
            }
          //}
        } 

        await utils.sleep(1000)
      }
    } catch (error) {
      if (error instanceof webdriver.error.NoSuchSessionError) {
        console.error('WebDriver session no longer exists');
      } else {
        console.error('An unexpected error occurred:', error)
      }
    } finally {
      //if(!!driver.session_id)
      //  driver.quit();  
      // This code always gets executed, regardless of whether an error occurred or not
    }
    return { news: companies_w_news, driver }
  },

  extract_news: async function(driver, url) { // https://es.finance.yahoo.com/noticias/softbank-obtiene-ganancia-ventas-inversiones-132932526.html    
    url =  `https://${url}`
    await driver.get(url)
    //const ulElement = await driver.findElement(By.css('ul.caas-list caas-list-bullet'));
    //await driver.executeScript("arguments[0].remove();", ulElement);
    //const element = await driver.wait(webdriver.until.elementLocated(By.css('div.caas-body')), 100000);
    try {
      const button = await driver.wait(webdriver.until.elementLocated(By.css('.link.caas-button.collapse-button')), 5000);
      button.click();
    } catch (error) {
      console.log('Continue button not found');
    }
    const element = await driver.findElement(By.css('div.caas-body'))
    const text = await element.getText();
    console.log("News read 🔥 🔥 🔥:", text.substr(0, 500))
    return text
  },


  async fetch_save_symbols(symbols, barsNum=3) {
    const t0 = new Date()
    let t1 = t0
    console.log("fetch_save_symbols:", moment(t0).format('YYYY-MM-DD hh:mm:ss'), ". ", symbols.length, " symbols" ) 
    let count = 0
    for(const symbol of symbols) { 
      const bars = await this.fetch_save_bars(symbol, barsNum)
      utils.sleep(600)
      count++
      if(count % 100 == 0) {
        console.log(`\n\n${count} symbols fetched & saved. Inc time: ${(((new Date())-t1)/1000/60).toFixed(2)} min. Total time: ${(((new Date())-t0)/1000/60).toFixed(2)} min\n`)
        t1 = new Date()
      }
    }
  },

  // db.bar.createIndex({ "symbol": 1, "date": 1 }, { unique: true })
  fetch_save_bars: async function(symbol, barsNum=50) { 
    const db = await mongo.connect()
    const bars = await this.fetch_bars(symbol, barsNum)
    if(!bars.length) return []

    if(barsNum < 10) {
      const bulkOps = bars.map(bar => ({
        updateOne: {
          filter: { symbol, date: bar.date },
          update: { $set: { open: bar.open, low: bar.low, high: bar.high, close: bar.close, volume: bar.volume } },
          upsert: true
        }
      }));
      await db.collection('bar').bulkWrite(bulkOps);
    } else { // massive load.
      const documents = bars.map(bar => ({
        symbol: symbol,
        date: bar.date,
        open: bar.open,
        low: bar.low,
        high: bar.high,
        close: bar.close,
        volume: bar.volume
      }));

      await db.collection('bar').insertMany(documents)
    }
    process.stdout.write(`${symbol}(${bars.length}) `)
    
    return bars
  },

  fetch_bars: async function(symbol, barsNum=250, period1=null, period2=null) { 
    if(!period1) {
      ( { period1, period2 } = utils.days_back(barsNum) )
    }
    console.log("yahoo.fetch_bars called:", symbol, barsNum, period1, period2)
    try {
      const result = await yahooFinance.historical(symbol, { // yahooFinance2
        period1,
        period2,
        interval: '1d'
      });
      return result
    } catch(err) {

    }
    return []
  },


  // yahoo wihtout API. Direct web fetch
  fetch_bars_old: async function(symbol, barsNum=300, insist=true) { // console.log("fetch_bars called with:", symbol)

    function round(num, decimalPlaces = 2) {
      num = Math.round(num + "e" + decimalPlaces);
      return Number(num + "e" + -decimalPlaces);
    }
    const db = await mongo.connect()
    const bars = []
    try {
      const url = `https://finance.yahoo.com/quote/${symbol}/history?p=${symbol}`
      const res = utils.fetch(url)
      const root = parse(res.data)
      const tables = root.querySelectorAll('table')
      const table = tables[0]
      const body = table.querySelector('tbody')
      const trs = body.getElementsByTagName('tr')
      let count = 0
      for(const tr of trs) {
        const tds = tr.getElementsByTagName('td')
        if(tds[1].toString().includes('Dividend') || tds.length < 7)
        continue
//console.log("tds:", tds[2].toString())
        const day = moment(new Date(tds[0].querySelector('span').text)).format('YYYY-MM-DD')
        if(!tds[1].querySelector('span'))
          continue
        let open = round(parseFloat(tds[1].querySelector('span').text))
        let high = round(parseFloat(tds[2].querySelector('span').text))
        let low = round(parseFloat(tds[3].querySelector('span').text))
        let close = round(parseFloat(tds[4].querySelector('span').text))
        let adjClose = parseFloat(tds[5].querySelector('span').text)
        let volume = 0
        if(!!tds[6].querySelector('span'))
          volume = parseInt(tds[6].querySelector('span').text.replace(/,/g, ""))
        const ratio = adjClose / close
        if(close != adjClose) {
          open = round(open*ratio)
          high = round(high*ratio)
          low = round(low*ratio)
        }

        const prices = [ open, low, high, close, adjClose ]
        if(prices.includes(0.00) || prices.includes(NaN)) {
          process.stdout.write(`${symbol}(🍩) `)
          db.collection('log').insertOne( {'descp': 'Symbol with null', symbol } )
          db.collection('security').deleteOne( { _id : symbol } )
          db.collection('bar').deleteMany( {'symbol':symbol} )
          return []
        }
        const new_bar = { symbol, day, open, high, low, close, volume }
        bars.push(new_bar)
        count++
        if(count == barsNum)
          break
      }
    } catch(err) {
      console.log("err:", err)
      process.stdout.write(`-`)
      if(!insist) return []
      await utils.sleep(30 * 1000) // 1/2 minuto
      await this.fetch_bars(symbol, barsNum)
      return []
    }
    return bars
  },


  async fetch_save_optionable_symbols(barsNum=3, last_date=null) {
    const db = await mongo.connect()
    if(!last_date) {
      const A_bars = await this.fetch_save_bars('A', 4)
      if(!A_bars.length) {
        console.log("Error fetching bars for A")
        return
      }
      last_date = A_bars[0].day
      console.log("last_date:", last_date)
    }

    const symbols_updated = (await db.collection('bar').find( { day: last_date } ).toArray()).map(bar => bar.symbol);
    console.log("symbols_updated:", symbols_updated.length)
    const optionable_symbols = (await db.collection('security').find( { optionable: true, } ).sort({  _id: 1 } ).toArray()).map(s => s._id);
    //console.log("optionable_symbols:", optionable_symbols)
    const symbols = optionable_symbols.filter((symbol) => !symbols_updated.includes(symbol));
    await this.fetch_save_symbols(symbols, barsNum)
  },

  fetch_last_bar: async function(symbol) {
    const bars = await this.fetch_bars(symbol)
    return bars[0]
  },



  symbol_details: async function(symbol, modules = ['price', 'summaryDetail', 'summaryProfile' ] ) {
    try {
      return yahooFinance.quoteSummary( symbol, { modules} ) // see the docs for the full list    
      return details
    } catch(err) {
      console.log("Err:", err)
      return false
    }
  },

  async get_symbol_bars(symbol, num) {
    const db = await mongo.connect()
    const bars = await db.collection('bar').find( { symbol } ).sort({  day: -1} ).limit( num ).toArray();
    return bars.reverse()
  },


  async get_symbol_name(symbol) {
    const db = await mongo.connect()
    try {
    const details = await yahoo.symbol_details(symbol, [ 'price'])
    const name = details.price.longName
    return name
    } catch(err) {
      console.warn(`${symbol} error getting name for ${symbol}: ${err}`)
    }
  },











  // yahoo wihtout API. Direct web fetch
  fetch_bars_2: async function(symbol, insist=true) { // console.log("fetch_bars called with:", symbol)

    function round(num, decimalPlaces = 2) {
      num = Math.round(num + "e" + decimalPlaces);
      return Number(num + "e" + -decimalPlaces);
    }
    const db = await mongo.connect()
    const bars = []
    try {
      const url =  `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`
            
      const res = request('GET', url);
      const answer = JSON.parse(res.getBody().toString()).chart.result[0]
      console.log("answer:", answer)
      for(const idx in answer.timestamp) {
        const day = utils.timestamp2date(answer.timestamp[idx])
        const bar = answer.indicators.quote[0]
        console.log("bar.open:", bar.open); return
        let open = round(bar.open[idx])
        let high = round(bar.high[idx])
        let low = round(bar.low[idx])
        let close = round(bar.close[idx])
        let volume = bar.volume[idx]

        const prices = [ open, low, high, close, volume ]
        console.log("prices:", prices)
        if(prices.includes(0) || prices.includes(NaN)) {
          process.stdout.write(`${symbol}(🍩) `)
          db.collection('log').insertOne( {'descp': 'Symbol with null', symbol } )
          db.collection('security').deleteOne( { _id : symbol } )
          db.collection('bar').deleteMany( {'symbol':symbol} )
          return []
        }
        const new_bar = { symbol, day, open, high, low, close, volume }
        bars.push(new_bar)
        count++
        if(count == barsNum)
          break
      
      }
    } catch(err) {
      console.log("err:", err)
      process.stdout.write(`-`)
      if(!insist) return []
      await utils.sleep(30 * 1000) // 1/2 minuto
      await this.fetch_bars(symbol, barsNum)
      return []
    }
    return bars
  },

  // for marketplace only
  fetch_bars2: async function(symbol, from=null, to='2025-01-01') { 
    function round(num, decimalPlaces = 2) {
      num = Math.round(num + "e" + decimalPlaces);
      return Number(num + "e" + -decimalPlaces);
    }
    //const console_copy = console.log // = function() {};
    //console.log = function() {};
    const db = await mongo.connect()
    if(!from) 
      from = moment(new Date()).format('YYYY-MM-DD')
    //console.log("get_symbol_details called with:", symbol, from, to)
    const bars = []
    try {
      const yahoo_bars = await yahooFinance.historical({ symbol, from, to, period: 'd' })  // 'd' (daily), 'w' (weekly), 'm' (monthly), 'v' (dividends only)
      console.log(symbol, "bars:", yahoo_bars)
      for(const bar of yahoo_bars) {          
        if (bar['adjClose'] == null || bar['close'] == null ||  bar['adjClose'] == '0.000000' ||  bar['close'] == '0.000000') {
          console.log(symbol, " has nulls")
          db.collection('log').insertOne( {'descp': 'Symbol with null', symbol } )
          db.collection('security').updateOne( { _id : symbol }, { $set: { optionable: false } } )
          db.collection('bar').deleteMany( {'symbol':symbol} )
          return []
        }
        const day =  moment(bar['date']).format('YYYY-MM-DD')
        const ratio = parseFloat(bar['adjClose']) / parseFloat(bar['close'])
        const open = round(parseFloat(bar['open'])*ratio)
        const high = round(parseFloat(bar['high'])*ratio)
        const low = round(parseFloat(bar['low'])*ratio)
        const close = round(parseFloat(bar['adjClose']))
        const volume = parseInt(bar['volume'])
        const new_bar = { symbol, day, open, high, low, close, volume  }
        bars.push(new_bar)
        //await db.collection('bar').insertOne( new_bar )
      }
    } catch(err) {
      console.log("Err:", err)
      return []
    }
    //console.log = console_copy;
    return bars
  },

}

/*
const yahooFinance = require('yahoo-finance2').default;
const d3 = require('d3-array');

async function get200DayMovingAverage(symbol) {
  // Get historical data for the stock
  const data = await yahooFinance.historical(symbol);

  // Calculate the 200-day moving average
  const movingAverage = d3.movingAverage(data.map(d => d.close), 200);

  return movingAverage;
}

get200DayMovingAverage('AAPL').then(movingAverage => {
  console.log(movingAverage);
});
*/

export default yahoo