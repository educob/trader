import { ObjectID } from 'mongodb';

import mongo from './mongo.js';
import utils from './utils.js';



const MONGO_URL = `mongodb://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/yahoo?retryWrites=true&w=majority`

const alpha = {

  load_alpha_summary: async function(symbol) {
    const db = await mongo.connect()
    const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${symbol}&apikey=Z38JWFVM0CSXCXSC`;
    const res = utils.fetch(url)
    if(res.err) {
      console.log("load_alpha_summary error:", err)
      return false
    }
    const summary = res.data
    const name = summary.Name
    const sector = summary.Sector
    const industry = summary.Industry
    const per = parseFloat(summary.PERatio)
    const pegr = parseFloat(summary.PEGRatio)
    const roe = parseFloat(summary.ReturnOnEquityTTM)
    const exchange = summary.Exchange
    const { modifiedCount } = await db.collection('security').updateOne( {_id: symbol }, { $set: { name, sector, industry, exchange, per, pegr, roe } }, { upsert: true } )
    return true
  },

  load_summaries: async function(symbols) {
    for(const symbol of symbols) {
      await this.load_alpha_summary(symbol)
    }
  },

  load_all_summaries: async function() {
    const db = await mongo.connect()
    let latest_summary = await db.collection('latest_summary').findOne( {} )
    console.log("latest_summary:", latest_summary)
    let latest 
    if(!latest_summary)
      latest = 'A'
    else
      latest = latest_summary.symbol
    const symbols = await db.collection('security').find( { _id: { $gt: latest } }, { sort: { _id: 1 } } ).limit( 3 ).toArray()
    for(const symbol of symbols) {console.log("symbol:", symbol)
      await this.load_alpha_summary(symbol._id)
      const { modifiedCount } = await db.collection('latest_summary').updateOne( { }, { $set: { symbol: symbol._id } }, { upsert: true } )
      latest = symbol._id
      await utils.sleep(1000)
    }
    latest_summary = await db.collection('latest_summary').findOne( {} )

    console.log( "Latest symbol:", latest)
  },









  // params
  var_1: 2,

   // for marketplace only
   load_yahoo_bars: async function(symbol, from='2012-01-01', to='2012-01-05') { 
    const db = mongo.db
    console.log("get_symbol_details called with:", symbol)
    try {
      const bars = await yahooFinance.historical({ symbol, from, to, period: 'd' })  // 'd' (daily), 'w' (weekly), 'm' (monthly), 'v' (dividends only)
      console.log("bars:", bars)
      for(const bar of bars) {          
        if (bar['adjClose'] == null || bar['close'] == null ||  bar['adjClose'] == '0.000000' ||  bar['close'] == '0.000000') {
          //console.log(symbol, " has nulls")
          db.collection('log').insert( {'descp': 'Symbol with null', symbol } )
          db.collection('security').remove( {'symbol':symbol} )
          db.collection('bar').deleteMany( {'symbol':symbol} )
          return false
        }
        const day = bar['date']
        const ratio = parseFloat(bar['adjClose']) / parseFloat(bar['close'])
        const open = parseFloat(bar['open'])*ratio
        const high = parseFloat(bar['high'])*ratio
        const low = parseFloat(bar['low'])*ratio
        const volume = parseInt(bar['volume'])
        const close = parseFloat(bar['adjClose'])
        await db.collection('security').insertOne( { symbol, day, open, high, low, close, volume  } )
      }
    } catch(err) {
      console.log("Err:", err)
      return false
    }
    return true
  },


}

export default alpha


