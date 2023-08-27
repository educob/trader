import fs from 'fs';
import { Chart, registerables } from 'chart.js';
import { createCanvas } from 'canvas';
import mongo from './mongo.js';
import chart from './chart.js';
import utils from './utils.js';


Chart.register(...registerables);

const pattern = {

  async detect_patterns(symbol) { //console.log("detect_patterns symbol:", symbol)
    const db = await mongo.connect()
    const patternNumBars = 70
    const extraBars = 20
    let all_bars = await db.collection('bar').find( { symbol }, { sort: { day: -1 } } ).limit( patternNumBars + extraBars).toArray()
    if(!all_bars.length) {
      console.log("no bars for ", symbol)
      return 
    }
    all_bars.reverse()
    //all_bars = all_bars.slice(0, -16)
    // detect in latest 30, 40, 50, ..., 100 bars.
    for(let i=10; i<=patternNumBars; i += 5) {
      let previous = parseInt(i/2)
      if( i + previous >  patternNumBars + extraBars)
        previous = patternNumBars + extraBars - i  
      const original_bars = all_bars.slice(-i-previous)
      const previous_bars = original_bars.slice(0, previous)
      const patternBars = original_bars.slice(-i)
      const previous_high_bar = this.highest(previous_bars)
      const prevous_low_bar = this.lowest(previous_bars)
      //const scaled_bars = this.rescaleBars(patternBars)
      let res = await this.detect_double_bottom(symbol, original_bars, patternBars, previous_high_bar)
      console.log(symbol, "res:", res)
      if(!!res.found) {
        console.log("res:", res)
        return res
      }
      //  res = this.detect_double_top(bars)
    }
  },

  async detect_double_bottom(symbol, original_bars, bars, previous_high_bar) {
    //chart.drawCandleStickChart(original_bars, 960, 500, `${symbol}_all_${bars.length}`)
    //chart.drawCandleStickChart(bars, 960, 500, `${symbol}_${bars.length}`)
    // top left
    const top_left_obj = this.highest(bars.slice(0, 5))
    const highest_obj = this.highest(bars.slice(0, parseInt(bars.length/2)))
    if(top_left_obj.bar.index != highest_obj.bar.index)  return { found: false, text: 'top_left_bar is not  highest' } 

    // first bottom
    const first_bottom_bar = this.lowest(bars.slice(0, parseInt(bars.length/2)))
    //if(first_bottom_bar.bar.low > 15) return { found: false, text: 'first_bottom_bar.bar.low', val: first_bottom_bar.bar.low }
    // second bottom
    const second_bottom_bar = this.lowest(bars.slice(parseInt(bars.length/2)))
    //if(second_bottom_bar.bar.low > 15) return { found: false, text: 'second_bottom_bar.bar.low', val: second_bottom_bar.bar.low }
    const perc_bottoms = utils.absPercentage(first_bottom_bar.bar.low, second_bottom_bar.bar.low)
    if(perc_bottoms > 15) return { found: false, text: 'perc_bottoms > 15', val: perc_bottoms } 
    const higher_bottom = first_bottom_bar.bar.close > second_bottom_bar.bar.low ? first_bottom_bar.bar.low : second_bottom_bar.bar.close
    // high
    const high_bar = this.highest(bars.slice(first_bottom_bar.bar.index, second_bottom_bar.bar.index))
    const price_goal_percentage = utils.absPercentage(higher_bottom, high_bar.bar.close)
    if( price_goal_percentage < 15 ) return { found: false, text: 'price_goal_percentage < 15', val: price_goal_percentage } 
    const price_goal = high_bar.bar.close - higher_bottom
    //if(high_bar.bar.close < 40 || high_bar.bar.close > 70) return { found: false, text: 'high_bar.bar.close', val: high_bar.bar.close }
    // about_2_confirm_bar
    const right_high_bar =  this.highest(bars.slice(parseInt(second_bottom_bar.bar.index)))
    if(right_high_bar.bar.high > high_bar.bar.high) return { found: false, text: 'right_high_bar.bar.high > high_bar.bar.high', val1: right_high_bar.bar.high, val2: high_bar.bar.high }
    const last_bar = bars[bars.length - 1];
    const last_bar_perc = utils.percentage(last_bar.high, high_bar.bar.high)
    if(last_bar_perc > 10) return { found: false, text: 'last_bar_perc', val1: last_bar_perc }
    //if( last_bar.high < 35) return { found: false, text: 'last_bar.high', val: last_bar.high }
    // previous bars
    if(previous_high_bar.bar.high < high_bar.bar.high * 2) return { found: false, text: 'previous_high_bar.bar.high < high_bar.bar.high * 2', 
                                                                      val1: previous_high_bar.bar.high, val2: high_bar.bar.high }
    // found
    chart.drawCandleStickChart(original_bars, 960, 500, `${symbol}_all_${bars.length}`)
    chart.drawCandleStickChart(bars, 960, 500, `${symbol}_${bars.length}`)
    return { found: true, bars }    
  },

  lowest(bars) {
    var lowest = Number.MAX_VALUE; // initialize to a very high value
    var index = -1; // initialize to an invalid index

    for (var i = 0; i < bars.length; i++) {
      var bar = bars[i];
      if (bar.low < lowest) {
        lowest = bar.low;
        index = i;
      }
    }
    return { bar, index }
  },

  highest(bars) {
    var highest = Number.MAX_VALUE; // initialize to a very high value
    var index = -1; // initialize to an invalid index

    for (var i = 0; i < bars.length; i++) {
      var bar = bars[i];
      if (bar.high > highest) {
        highest = bar.high;
        index = i;
      }
    }
    return { bar, index }
  },

  rescaleBars(bars) {
    var min = Number.MAX_VALUE;
    var max = Number.MIN_VALUE;
  
    // Find the minimum and maximum values across all bars
    bars.forEach(function(bar) {
      min = Math.min(min, bar.low, bar.close);
      max = Math.max(max, bar.high, bar.close);
    });
  
    // Calculate the range
    var range = max - min;
  
    // Rescale each bar between 0 and 100
    // original values are open_, low_,...
    // scaled vaules are open, low, ...
    return bars.map( (bar) => {
      const new_bar = 
        { open: (bar.open - min) / range * 100,
          open_: bar.open,
          low: (bar.low - min) / range * 100,
          low_: bar.low,
          high: (bar.high - min) / range * 100,
          high_: bar.high,
          close: (bar.close - min) / range * 100,
          close_: bar.close 
        }
      return new_bar
    })
  },

  rescaleArray(arr) {
    var min = Math.min.apply(null, arr);
    var max = Math.max.apply(null, arr);
    var range = max - min;
    return arr.map(function(x) {
      return (x - min) / range * 100;
    });
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
