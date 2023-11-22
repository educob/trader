import fs from 'fs';
import { Chart, registerables } from 'chart.js';
import { createCanvas } from 'canvas';
import mongo from './mongo.js';
import chart from './chart.js';
import utils from './utils.js';
import yahoo from './yahoo.js'

Chart.register(...registerables);

const pattern = {

  async detect_patterns(symbols, patterns = [ 'double', 'sma50', 'atr' ]) { //console.log("detect_patterns symbol:", symbol)
    const db = await mongo.connect()
    let count = 0
    console.log(`checking symbols for patterns`)
    let sma50Distances = []
    let ATRs = []
    for(let i = 0; i < symbols.length; i++) {
      const symbol = symbols[i]._id
      count++
      if(count % 100 == 0) console.log(`${count} symbols checked for patterns`)
      // read db bars
      const patternNumBars = 70
      let db_bars = await db.collection('bar').find( { symbol }, { sort: { date: -1 } } ).limit( patternNumBars).toArray()
      if(!db_bars.length) {
        console.log("no bars for ", symbol)
        continue 
      }
      db_bars.reverse() // back to proper order
      //console.log(symbol, "last bar:", db_bars[db_bars.length-1])

      // 50 sma distance
      const distance = utils.sma50Distance(db_bars)
      if(distance >= 0.05)
        sma50Distances.push( { symbol, distance } )
      // ATR
      const atr = utils.atr(db_bars)
      if(!!atr)
        ATRs.push( { symbol, atr } )

      // patterns
      const patternMethods = [ 
        this.detect_double_top,
        this.detect_double_bottom,
      ]


      const scaled_bars = utils.rescaleBars(db_bars)
      for (let i = 0; i < patternMethods.length; i++) {
        const res = patternMethods[i](this, symbol, scaled_bars)
        if(!!res.found) {
          patterns.push(res)
          this.save_pattern(symbol, res.type)
          break // ends patternMethods loop
        }
      }
    } // END symbols loop
    console.log("Found:", patterns.length)
    
    // process 50 sma distance
    sma50Distances.sort((a, b) => b.distance - a.distance)
    let n = 25; // n highest 50 sma distance
    sma50Distances = sma50Distances.slice(0, n);
    for(const sma50Distance of sma50Distances) {
      console.log(`50 SMA distance ${sma50Distance.symbol}: ${sma50Distance.distance}`)
      await this.save_pattern(sma50Distance.symbol, '50 SMA Distance')
    }

    // process ATR
    ATRs.sort((a, b) => b.atr - a.atr)
    ATRs = ATRs.slice(0, n);
    for(const atr of ATRs) {
      console.log(`ATR ${atr.symbol}: ${atr.atr}`)
      await this.save_pattern(atr.symbol, 'ATR')
    }
  },

  async save_pattern(symbol, type) {
    const db = await mongo.connect()
    try {
    const details = await yahoo.symbol_details(symbol, [ 'price'])
    const name = details.price.longName
    const url = `https://www.tradingview.com/chart/pZEV1rzf/?symbol=${symbol}`
    await db.collection('pattern').updateOne( { symbol }, { $set: { name, url, type } }, { upsert: true } )
    } catch(err) {
      console.warn(`${symbol} error saving pattern: ${err}`)
    }
  },

  detect_double_top(self, symbol, bars, type="Double Top") {
    //chart.drawCandleStickChart(bars, 960, 500, `${symbol}_${bars.length}`)
    // bottom left
    let lowest_bar = utils.lowest(bars)

    const near_top1 = utils.first_higher(bars, lowest_bar.index, 85)
    if(near_top1.index === -1 ) return { found: false } 

    // find medium low
    // it can't go below 45
    let first_lower = utils.first_lower(bars, near_top1.index, 45)
    if(first_lower.index > -1 ) return { found: false } 
    const near_medium = utils.first_between(bars, near_top1.index, 45, 70)
    if(near_medium.index === -1 ) return { found: false } 

    // find new second top
    const near_top2 = utils.first_higher(bars, near_medium.index, 85)
    if(near_top2.index === -1 ) return { found: false } 
    // medium minimum
    const between_tops = bars.slice(near_medium.index, near_top2.index)
    const medium = utils.lowest(between_tops)

    // close to confirmation
    // it can't go below medium.close*0.96
    const last_low = utils.first_lower(bars, near_top2.index + 1, medium.bar.close*0.85 )
    if(last_low.index > -1 ) return { found: false } 
    const last_bar = bars[bars.length-1]
    if(last_bar.close > medium.bar.close * 1.1 ) return { found: false } 

    // found
    //chart.drawCandleStickChart(bars, 960, 500, `${symbol}_${bars.length}`)
    console.log(`${type}: ${symbol} : ${lowest_bar.bar.close}, ${near_top1.bar.close}, ${medium.bar.close} ${near_top2.bar.close}, ${last_bar.close}`)
    return { found: true, bars, type }    
  },

  detect_double_bottom(self, symbol, bars) {
    const inverted = utils.invertBars(bars)
    return self.detect_double_top(self, symbol, inverted, 'Double Bottom')
  },



















  draw_ascending_triangule(numPoints= 30, width=1000, height=1000) {
    const basePrice = 5 // Math.random() * 20
    
    const fluctuationRange = 5;

    // Generate initial data point for stock price
    let stockPrice = basePrice;
    let chartData = [ basePrice ];
    const topsRange = [ 2, 3 ]
    const topsNum = topsRange[ Math.floor(Math.random() * topsRange.length) ];
    const tops = []


    // Generate data points for stock price
    for (let i = 1; i < numPoints; i++) {
      // Generate a random fluctuation within the range
      const fluctuation = (Math.random() * fluctuationRange) - (fluctuationRange / 2);
      console.log("fluctuation:", fluctuation)
      
      // Calculate new stock price and ensure it does not go below zero
      stockPrice += fluctuation;
      if (stockPrice < 0) {
        stockPrice = 0;
      } else if(stockPrice > 100) 
        stockPrice = 100;
      
      // Add data point to chart data
      chartData.push( stockPrice );
    }
    chartData[29] = 100
    console.log("chartData:", chartData)

    const canvas = this.createChartLine(chartData, width, height)
    this.save_chart(canvas, width, height)
  },


  draw_double_bottom(numPoints= 30, width=1000, height=1000) {
    const stockPrice = [] 
    const firstBottom = Math.random() >= 0.4
    const highBottomY = Math.max(0, utils.normalSample(5, 3))
    const bottomX1 = utils.normalSample(30, 3)

    const canvas = this.createCanvas(close, width, height)
    this.save_chart(canvas, width, height)
  },



  createChartLine(close, width, height, fileName=null) {
    const labels = new Array(close.length).fill('')
    const canvas = createCanvas(width, height)
    const context = canvas.getContext('2d')
    const plugin = {
      id: 'backgroundColor',
      beforeDraw: ({ config: { options }, ctx }) => {
        ctx.save();
        ctx.fillStyle ='rgba(255, 255, 255, 1)';
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }
    };

    const data = {
      labels,
      datasets: [{
        label: '',
        data: close,
        fill: false,
        borderColor: 'rgb(0, 0, 0)',
        pointBorderWidth: 0,
        borderWidth:1,
        //showLine: false
      }],
    };

    const options = {
      scales: {
        y: {
          beginAtZero: true,
          display: false
        },
        x: {
          display: false
        },
      }
    }

    const myChart = new Chart(context, {
      type: "line",
      data: data,
      options: options,
      plugins: [plugin],
    });

    if(!!fileName) 
      this.save_chart(canvas, width, height, fileName)
    return canvas
  },

  save_chart(canvas, width, height, file='image') {
    const incY = 27
    const canvas2 = createCanvas(width, height-incY)
    const context2 = canvas2.getContext('2d')

    context2.drawImage(canvas,0,-incY)

    const buffer = canvas2.toBuffer('image/png')
    fs.writeFileSync(`./pics/${file}.png`, buffer)
  }
}


export default pattern;
