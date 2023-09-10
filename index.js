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

async function start() {

  let db = await mongo.connect()
  let [arg1, arg2, arg3, arg4] = process.argv.slice(2, 6)

  if(!arg1) {
    console.log("USAGE:\n bars bars_num \n gpt prompt \n jobs \n patterns")
    process.exit(1)
  }

  if(arg1 === 'bars') {
    const symbols = await yahoo.symbols_with_bars() // await utils.symbols_without_bars()
    console.log(`${symbols.length} symbols with bars`)
    if(!arg2)
      arg2 = 3
    await yahoo.fetch_save_symbols(symbols, arg2)
  } else if(arg1 === 'gpt') {  
    if(!arg2)
      arg2 = 'what day is today'
    const answer = await gpt.ask(arg2)
    console.log("answer:", answer)
    console.log("Thanks for using gpt")
  } else if(arg1 === 'jobs') {
    await jobs()
    const jobs_cron = new CronJob('0 */20 * * * *', jobs)  // 1 in the morning. each minute: 0 */1 * * * *: seconds, minutes, hours day_of_month(1-31), months(0-11), day-fo-week(0-6)
    jobs_cron.start()    
  } else if(arg1 === 'patterns') {
    const res = await detect_patterns() ; return
    console.log("res:", res)
  } else if(arg1 === 'news') {
    await process_news()
    const jobs_cron = new CronJob('0 */20 * * * *', process_news)
    jobs_cron.start()
  // symbol 
  } else if(arg1 === 'symbol') { console.log("Symbol: ", arg2)
    if(!arg2) {
      console.log("USAGE: symbol AAPL bars 3")
      return
    }
    if(arg3 === 'bars') {
      if(!arg4)
        arg3 = 3
      const bars = await yahoo.fetch_bars(arg2, arg4)
      console.log("bars:", bars, "Total: ", bars.length)
    } else if(arg3 === 'details') {
      const res = await yahoo.symbol_details(arg2)
      console.log("Details:", res)
    }
  }

}

async function jobs() {
  //await check_breakouts()
  process_news()
}

async function process_news() { console.warn("Start processing news")
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
  let companies_w_news = await yahoo.fetch_news(urls)
  console.log("🖥️ 🖥️ 🖥️ 🖥️ 🖥️ companies_w_news:", companies_w_news)
  if(!!companies_w_news.length) {
    const res = await utils.email(`Empresas yahoo con noticias`, JSON.stringify(companies_w_news, null, 4))
    console.log("email enviado:", res.response)
  }
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
  const symbols_w_bars = await utils.symbols_with_bars()
  let count = 0
  console.log(`checking symbols for patterns`)
  const patterns = []
  for(const symbol of symbols_w_bars) {
    count++
    if(count % 100 == 0) console.log(`${count} symbols checked for patterns`)
    // check if already under analysis
    const dbSymbol = await db.collection('analysis').findOne( { symbol } )
    if(!!dbSymbol) continue
    const res = await pattern.detect_patterns(symbol._id)
    if(!!res.found)
      patterns.push(res)
  }
  console.log("Found:", patterns.length)
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





