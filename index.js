import { CronJob } from 'cron';


import mongo from './lib/mongo.js'
import yahoo from './lib/yahoo.js';
import utils from './lib/utils.js';
import pattern from './lib/pattern.js';
import gpt from './lib/gpt.js';

// CODE
const jwtToken = process.env.jwtToken
if(!jwtToken) console.log("Must: export jwtToken=xxx")

start()

// pm2 start index.js --cron "*/20 * * * *" --name news -- news --exit-code 1
// pm2 restart
// pm2 logs news --follow
// pm2 stop news
// pm2 list
// pm2 flush : reset logs
async function start() {
  let [ command ] = process.argv.slice(2, 3)

  if(!command) {
    console.log("USAGE:\n bars bars_num symbolFrom \n gpt \"prompt\" \n jobs \n patterns")
    process.exit(1)
  }

  if(command === 'dayjob') {
    let  [ force ] = process.argv.slice(3,4)
    console.log("Starting day_job cron. force:", !!force)
    if(!!force) {
      await day_job()
    }
    const day_job_cron = new CronJob('0 0 1 * * *', day_job)
    day_job_cron.start()    

  } else if(command === 'bars') {
    let  [barsNum, symbolFrom ] = process.argv.slice(3, 5)
    const db = await mongo.connect()
    //let symbols = await yahoo.symbols_with_bars() // await utils.symbols_without_bars()
    //await db.collection('symbols_w_bars').insertOne( { symbols } )
    let symbols = (await db.collection('symbols_w_bars').findOne( {} )).symbols
    symbols.sort();
    if(!!symbolFrom) {
      let index = symbols.findIndex(symbol => symbol >= symbolFrom);
      symbols = symbols.slice(index);
    }
    console.log(`${symbols.length} symbols with bars`)
    if(!barsNum)
      barsNum = 2
    await yahoo.fetch_save_symbols(symbols, barsNum)
  } else if(command === 'gpt') {  
    let  [ prompt ] = process.argv.slice(3, 4)
    if(!prompt)
      prompt = 'what day is today'
    const answer = await gpt.ask(prompt)
    console.log("answer:", answer)
    console.log("Thanks for using gpt")
  } else if(command === 'jobs') {
    await jobs()
    const jobs_cron = new CronJob('0 */20 * * * *', jobs)  // 1 in the morning. each minute: 0 */1 * * * *: seconds, minutes, hours day_of_month(1-31), months(0-11), day-fo-week(0-6)
    jobs_cron.start()    
  } else if(command === 'patterns') {
    const res = await detect_patterns() 
  } else if(command === 'news') {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    if ((hours === 0 && minutes >= 40) || (hours === 1) || (hours === 2) || (hours === 3)) {
      console.log("No news processing while fetching bars and processing patterns.", new Date())
      return
    }
    await process_news()
    //const jobs_cron = new CronJob('0 */20 * * * *', process_news) // new CronJob('0 */20 * * * *', process_news)
    //jobs_cron.start()
  // symbol 
  } else if(command === 'symbol') {    
    let  [ symbol, subcommand, num ] = process.argv.slice(3, 6)
     console.log("Symbol: ", subcommand)
    if(!subcommand) {
      console.log("USAGE: symbol AAPL bars 3")
      return
    }
    if(subcommand === 'bars') {
      if(!num)
        num = 3
      const bars = await yahoo.fetch_save_bars(symbol, num)
      console.log("bars:", bars, "Total: ", bars.length)
    } else if(subcommand === 'details') {
      const res = await yahoo.symbol_details(symbol)
      console.log("Details:", res)
    }
  }

}


async function day_job() { 
  // check if it's sunday or monday.
  const today = new Date();
  const dayOfWeek = today.getDay();

  if (dayOfWeek === 0 || dayOfWeek === 1) {
    console.log('Today is either Sunday or Monday.', new Date());
    return
  }

  // bars 2
  const db = await mongo.connect()
  let symbols = (await db.collection('symbols_w_bars').findOne( {} )).symbols
  symbols.sort();
  await yahoo.fetch_save_symbols(symbols, 2)
  // patterns
  await detect_patterns() 
  console.log(`Day job run on ${(new Date()).toString().substring(0, 16)}`)
}

async function jobs() {
  //await check_breakouts()
  process_news()
}

async function process_news() { console.info("Start processing news")
  const urls = [ 
    'https://finance.yahoo.com/screener/predefined/ms_basic_materials/',
    'https://finance.yahoo.com/screener/predefined/ms_communication_services/',
    'https://finance.yahoo.com/screener/predefined/ms_consumer_cyclical/',
    'https://finance.yahoo.com/screener/predefined/ms_consumer_defensive/',
    'https://finance.yahoo.com/screener/predefined/ms_energy/',
    'https://finance.yahoo.com/screener/predefined/ms_financial_services/',
    'https://finance.yahoo.com/screener/predefined/ms_healthcare/',
    'https://finance.yahoo.com/screener/predefined/ms_industrials/',
    'https://finance.yahoo.com/screener/predefined/ms_real_estate/',
    'https://finance.yahoo.com/screener/predefined/ms_technology/',
    'https://finance.yahoo.com/screener/predefined/ms_utilities/'
  ]
  let { news, driver } = await yahoo.fetch_news(urls)
  console.log("🖥️ 🖥️ 🖥️ 🖥️ 🖥️ news:", news.length, new Date())
  const db = await mongo.connect()
  for(const news_piece of news) {

    const { symbol, url, impact, summary, reason } = news_piece
    const details = await yahoo.symbol_details(symbol, [ 'price'])
    const name = details.price.longName
    console.log("symbol, url, impact, summary, reason:", symbol, url, impact, summary, reason)
    //const res = await utils.email(`Empresas yahoo con noticias`, JSON.stringify(news, null, 4))
    await db.collection('pattern').updateOne( { symbol }, { $set: { name, url, type: 'News', impact, summary, reason } }, { upsert: true } )
    console.log("News recorded")
  }
  await driver.quit()
  //process.exit(0)
}

async function check_breakouts() {
  const db = await mongo.connect()
  const breakouts = await db.collection('breakout').find( { active: true } ).toArray()
  for(const breakout of breakouts) { //console.log("breakout:", breakout)
    const bars = await yahoo.fetch_bars(breakout.symbol, 2, false)
    if(bars.length) {
      const bar = bars[0]
      if(bar.close > breakout.up) {
        await utils.email(`Breakout UP ${breakout.symbol}`, `${breakout.symbol} ${breakout.pattern}. Spread type: ${breakout.spread}: ${bar.close}`)
        await db.collection('breakout').updateOne( { symbol: breakout.symbol }, { $set: { active: false, confirmed: utils.today() } } )
        console.log("Breakout UP:", breakout.symbol, bar.close, " > > > > > > >")
      }
      if(bar.close < breakout.down) {
        await utils.email(`Breakout DOWN ${breakout.symbol}`, `${breakout.symbol} ${breakout.pattern}. Spread type: ${breakout.spread}: ${bar.close}`)
        await db.collection('breakout').updateOne( { symbol: breakout.symbol }, { $set: { active: false, confirmed: utils.today() } } )
        console.log("Breakout DOWN:", breakout.symbol, bar.close, " < < < < < <")
      }
    }
    utils.sleep(1000)
  }
}

async function detect_patterns() {
  const db = await mongo.connect()
  // unlock patterns after 1 month.
  db.collection('locked_pattern').deleteMany({ locked: { $lt: new Date() } })
  const symbols_w_bars = await utils.symbols_with_bars()
  // filters
  const locked = await db.collection('analysis').find( { } ).toArray()
  const analysis = await db.collection('analysis').find( { } ).toArray()
  const symbols_w_patterns = await db.collection('pattern').find( { } ).toArray()
  const combinedArray = symbols_w_patterns.concat(locked, analysis);
  // remove symbols already under analysis
  let symbols = symbols_w_bars.filter((symbol) => {
    return !combinedArray.some((filteredSymbol) => {
      return filteredSymbol.symbol === symbol._id;
    });
  });
  await pattern.detect_patterns(symbols)
}



async function test() {
  const db = await mongo.connect()
  const bars = await  db.collection('bar').find({ day: { $nin: ["2023-04-05"] } })
  console.log("bars:", bars.length); return


  const symbols = await db.collection('bar').distinct("symbol", { day: { $nin: ["2023-04-05"] } })
  console.log("symbols:", symbols.length)
}














/* 
{
    "Symbol": "AAPL",
    "AssetType": "Common Stock",
    "Name": "Apple Inc",
    "Description": "Apple Inc. is an American multinational technology company that specializes in consumer electronics, computer software, and online services. Apple is the world's largest technology company by revenue (totalling $274.5 billion in 2020) and, since January 2021, the world's most valuable company. As of 2021, Apple is the world's fourth-largest PC vendor by unit sales, and fourth-largest smartphone manufacturer. It is one of the Big Five American information technology companies, along with Amazon, Google, Microsoft, and Facebook.",
    "CIK": "320193",
    "Exchange": "NASDAQ",
    "Currency": "USD",
    "Country": "USA",
    "Sector": "TECHNOLOGY",
    "Industry": "ELECTRONIC COMPUTERS",
    "Address": "ONE INFINITE LOOP, CUPERTINO, CA, US",
    "FiscalYearEnd": "September",
    "LatestQuarter": "2022-12-31",
    "MarketCapitalization": "2389581496000",
    "EBITDA": "125287997000",
    "PERatio": "24.68",
    "PEGRatio": "2.75",
    "BookValue": "3.581",
    "DividendPerShare": "0.91",
    "DividendYield": "0.0063",
    "EPS": "6.12",
    "RevenuePerShareTTM": "24.08",
    "ProfitMargin": "0.246",
    "OperatingMarginTTM": "0.294",
    "ReturnOnAssetsTTM": "0.196",
    "ReturnOnEquityTTM": "1.479",
    "RevenueTTM": "387537011000",
    "GrossProfitTTM": "170782000000",
    "DilutedEPSTTM": "6.12",
    "QuarterlyEarningsGrowthYOY": "-0.105",
    "QuarterlyRevenueGrowthYOY": "-0.055",
    "AnalystTargetPrice": "168.21",
    "TrailingPE": "24.68",
    "ForwardPE": "23.09",
    "PriceToSalesRatioTTM": "5.51",
    "PriceToBookRatio": "44.63",
    "EVToRevenue": "5.92",
    "EVToEBITDA": "17.53",
    "Beta": "1.278",
    "52WeekHigh": "178.53",
    "52WeekLow": "123.98",
    "50DayMovingAverage": "141.47",
    "200DayMovingAverage": "147.21",
    "SharesOutstanding": "15821900000",
    "DividendDate": "2023-02-16",
    "ExDividendDate": "2023-02-10"
    */





