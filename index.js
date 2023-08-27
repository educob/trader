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
  let [arg1, arg2] = process.argv.slice(2)

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
  } else if(arg1 === 'patterns') {
    const res = await detect_patterns() ; return
    console.log("res:", res)
  } else if(arg1 === 'news') {
    process_news()
  } 

  //google.get_symbol_bars('AAPL'); return



  // load US all CSVs
  //mongo.load_CSVs('/home/r2d2/trader/symbols/US_all', 1, false)
  //mongo.load_CSVs('/home/r2d2/trader/symbols/no_sector', 1, false)
  // load US optionable
  //mongo.load_CSVs('/home/r2d2/opt/trader/symbols/US_optionable', 1, true)
  // load 12000 stocks
  //mongo.load_CSV2('/home/r2d2/trader/symbols/12000', '12000.csv')

  // load single CSV
  //mongo.load_CSV('/home/r2d2/trader/symbols', 'Stocks-list_US.csv', 1, false)

  // load csv with PER
  //mongo.load_CSV_w_per('/home/r2d2/trader/symbols/us_per', 'stocks-P-E_Mar-2023.csv', 1)
  //mongo.load_CSV_w_per('/home/r2d2/trader/symbols/us_per', 'stocks-P-E_Mar-2023_2.csv', 1)

  // load_alpha 2 securities
  //alpha.load_summaries( [ 'ACHR', 'AIR' ] )

  // load alpha all summaries
  //alpha.load_all_summaries()

  // laod yahoo pr
  //yahoo.load_symbol_profile('AAPL')

  // load all yahoo profiles
  //await yahoo.load_all_symbol_profiles()

  // remove failed yahoo securities (mostly funds)
  //mongo.remove_failed_symbols()

  // load yahoo symbol stats
  //yahoo.load_symbol_stats('AAPL')

  // load all yahoo stats
  //yahoo.load_all_symbol_stats()

  // compute sector pers
  //console.log( await yahoo.compute_sector_per_thresholds() )
  
  //check_breakouts()

  //await test() ; return

  //await yahoo.fetch_save_optionable_symbols(4) ; return

  //const bars = await yahoo.fetch_save_bars('CWCO') 
  //console.log("bars:", bars.length) ; return

  //const symbols_w_bars = await utils.symbols_with_bars()
  //console.log("symbols_w_bars", symbols_w_bars[0], symbols_w_bars.length) ; return

  //const securitiesWithoutBars = await utils.symbols_without_bars()
  //console.log("securitiesWithoutBars:", securitiesWithoutBars[0], securitiesWithoutBars.length) ; return

}

async function test() {
  const db = await mongo.connect()
  const bars = await  db.collection('bar').find({ day: { $nin: ["2023-04-05"] } })
  console.log("bars:", bars.length); return


  const symbols = await db.collection('bar').distinct("symbol", { day: { $nin: ["2023-04-05"] } })
  console.log("symbols:", symbols.length)
}

async function detect_patterns() {
  const db = await mongo.connect()
  const symbols_w_bars = await utils.symbols_with_bars()
  let count = 0
  console.log(`checking symbols for patterns`)
  for(const symbol of symbols_w_bars) {
    await pattern.detect_patterns(symbol._id)
    count++
    if(count % 100 == 0) console.log(`${count} symbols checked for patterns`)
  }
}

async function jobs() {
  //await check_breakouts()
  await process_news()
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
  setTimeout(check_breakouts, 1000 * 60 * 10) 
}

async function process_news() {
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
  console.log("companies_w_news:", companies_w_news)
  if(!!companies_w_news.length) {
    const res = await utils.email(`Empresas yahoo con noticias`, JSON.stringify(companies_w_news, null, 4))
    console.log("email enviado:", res.response)
  }
  setTimeout(process_news, 1000 * 60 * 10) 
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





