import request from 'sync-request';
import moment from 'moment';
import nodemailer from 'nodemailer';
import webdriver, { By } from 'selenium-webdriver';
import chromedriver from './chromedriver.js';
import mongo from './mongo.js';
import fs from 'fs';
import sharp from 'sharp';
import { SMA, ATR } from 'technicalindicators'




let mailer = nodemailer.createTransport({ 
  //host: "SSL0.OVH.NET",
  //port: 587,
  //secure: false, // true for 465, false for 587
  service: "gmail",
  auth: {
    user: 'educobian@gmail.com',
    pass: 'revfimjmfgfgrtpw'
  },
})


const utils = {

  fetch: function (url) {  //console.log("url:", url)
    const res = request('GET', url, { headers:  {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive'
  } })
    return { data: res.getBody(), err: null }
  },


  check_internet: function () {
    const res = request('GET', 'https://www.google.com', { headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive'
    } });
    console.log(res.getBody().toString());
},

  get_html: function (url) { // console.log("url:", url)
    const res = request('GET', url, { headers: {'User-Agent': 'request'} })
    console.log("res:", res)
    //return { data: JSON.parse(res.getBody()), err: null }
    const htmlContent = res.getBody().toString()
    return { html: htmlContent, err: null }
    fs.writeFileSync('output.html', htmlContent);
  },

  sleep: async function(ms){
    return new Promise(resolve=>{
        setTimeout(resolve,ms)
    })
  },

  count_sector_indutries: async function() {
    const db = await mongo.connect()
    const sectors = await db.collection('security').aggregate([
      {$group : {_id:"$sector", count:{$sum:1}}}]).toArray()
    //console.log("Sectors:")
    return sectors

    //const industries = await db.collection('security').aggregate([
    //  {$group : {_id:"$industry", count:{$sum:1}}}]).toArray()
    //console.log("Industries:")
    //industries.forEach( ind => console.log(ind))
  },

  days_back(num) {
    const increment = num > 10
    const period2 = new Date();
    const period1 = new Date(period2);
    if(!!increment)
      period1.setDate(period1.getDate() - (num * 7 / 5));
    else
    period1.setDate(period1.getDate() - num);
    return { period1, period2 }
  },

  symbols_with_bars: async function() {
    const db = await mongo.connect()
    const symbols_w_bars = await db.collection('bar').aggregate([
      // Group by the security symbol and count the number of documents in each group
      { $group: { _id: '$symbol', count: { $sum: 1 } } },
      // Filter out groups with a count of 0 (i.e. securities with no bars)
      { $match: { count: { $gt: 0 } } },
      { $sort: { symbol: 1 } },
    ]).toArray()
    return symbols_w_bars
  },

  // bars operations

  lowest(bars, idx=0) {
    var lowest = Number.MAX_VALUE; // initialize to a very high value
    var index = -1; // initialize to an invalid index
    let lowest_bar
    for (var i = idx; i < bars.length; i++) {
      const bar = bars[i];
      if (bar.low < lowest) {
        lowest = bar.low;
        lowest_bar = bar
        index = i;
      }
    }
    return { bar: lowest_bar, index }
  },

  highest(bars, idx=0) {
    var highest = Number.MAX_VALUE; // initialize to a very high value
    var index = -1; // initialize to an invalid index
    let highest_bar
    for (var i = idx; i < bars.length; i++) {
      const bar = bars[i];
      if (bar.high > highest) {
        highest = bar.high;
        highest_bar = bar
        index = i;
      }
    }
    return { bar: highest_bar, index }
  },

  first_higher(bars, from, threshold) {
    for (let i = from + 1; i < bars.length; i++) {
        if (bars[i].close >= threshold) {
            return { bar: bars[i], index: i };
        }
    }
    return { index: -1 };
  },

  first_lower(bars, from, threshold) {
    for (let i = from + 1; i < bars.length; i++) {
        if (bars[i].close <= threshold) {
            return { bar: bars[i], index: i };
        }
    }
    return { index: -1 };
  },

  first_between(bars, from, min, max) {
    for (let i = from + 1; i < bars.length; i++) {
      if (bars[i].close >= min && bars[i].close <= max) {
          return { bar: bars[i], index: i };
      }
    }
    return { index: -1 };
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
          //open_: bar.open,
          low: (bar.low - min) / range * 100,
          //low_: bar.low,
          high: (bar.high - min) / range * 100,
          //high_: bar.high,
          close: (bar.close - min) / range * 100,
          //close_: bar.close 
        }
      return new_bar
    })
  },

  invertBars(bars) {
    let maxVal = Math.max(...bars.map(bar => bar.high));
    let reversedBars = bars.map(bar => ({
      open: maxVal - bar.open,
      high: maxVal - bar.high,
      low: maxVal - bar.low,
      close: maxVal - bar.close
    }));
    return reversedBars;
  },

  rescaleArray(arr) {
    var min = Math.min.apply(null, arr);
    var max = Math.max.apply(null, arr);
    var range = max - min;
    return arr.map(function(x) {
      return (x - min) / range * 100;
    });
  },

  symbols_without_bars: async function() {
    const db = await mongo.connect()
    let optionables = await db.collection('security').find( { optionable: true } ).toArray();
    optionables = optionables.map(s => s._id)
    let symbols_with_bars = await this.symbols_with_bars()
    symbols_with_bars = symbols_with_bars.map(s => s._id)
    let symbols_without_bars = optionables.filter((symbol) => !symbols_with_bars.includes(symbol));
    return symbols_without_bars
  },

  email: async function(subject, html) {
    return mailer.sendMail({
      from: '"Noticias Yahoo!! Trader R us Alert." <>', // sender address
      to: 'educobian@gmail.com', // list of receivers to: ['recipient1@example.com', 'recipient2@example.com'],
      subject, // Subject line
      //text: "xxxx?", // plain text body
      html // html body
    });
  },

  today: function() {
    return moment(new Date()).format('YYYY-MM-DD')
  },

  percentage(val1, val2) {
    return 100 * (val2 - val1) / val1
  },

  absPercentage(val1, val2) {
    return Math.abs(this.percentage(val1, val2))
  },

  normalSample(mean=0, stdDev=1) {
    var u1 = 1 - Math.random(); // to avoid taking the log of zero
    var u2 = 1 - Math.random();
    var normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return normal * stdDev + mean;
  },

  fetch_url: async function(url, acceptCookies=true) {
    let driver

    try { // server: chromedriver

      driver = chromedriver.get()

      console.log("dumping url:", url)
      // click on agree terms.
      if(acceptCookies) {
        await driver.findElement(By.name('agree')).click()
      }

      // Wait for the page to load and the JavaScript to execute
      // Get the HTML content of the page after the JavaScript has executed
      const html = await driver.getPageSource()
      return html
    } catch (error) {
      if (error instanceof webdriver.error.NoSuchSessionError) {
        console.error('WebDriver session no longer exists');
      } else {
        console.error('An unexpected error occurred:', error)
      }
    }
    driver.quit();  
  },

  // const image = await utils.takeScreenshot(driver, 'agree')
  // await utils.cropImge(image, 0, 36, 830, 670) ; return []

  takeScreenshot: async function (driver) {
    try {
      //await driver.findElement(By.name(element))
      console.log("before taking a picture")
      const image = await driver.takeScreenshot();

      console.log("image taken")
      await fs.promises.writeFile('raw_screenshot.png', image, 'base64');
      console.log("image save as raw_screenshot.png")
      return image
    } catch (err) {
        console.log(err);
    }
  },

  cropImge: async function(screenshot, left, top, width, height) {
    // Convert the screenshot to a Buffer
    const screenshotBuffer = Buffer.from(screenshot, 'base64');

    // Define the cropping area (left, top, width, height)
    const cropArea = { left, top, width, height };

    // Crop the image
    const croppedImageBuffer = await sharp(screenshotBuffer)
      .extract(cropArea)
      .toBuffer();

    // Save the cropped image
    require('fs').writeFileSync('cropped_screenshot.png', croppedImageBuffer);
    console.log("cropped image saved as cropped_screenshot.png")
  },

  timestamp2date: function (timestamp) {
    const date = new Date(timestamp * 1000);
    return date.toISOString().split('T')[0];
  },

  // indicators
  sma50Distance(bars) {// console.log("last bar:", bars[bars.length-1])
    const close = bars.map( bar => bar.close)
    //console.log("close:", close)
    const lastClose = close[close.length-1]
    const sma50 = SMA.calculate( { period: 50, values: close } );
    const lastSMA = sma50[sma50.length - 1]
    //console.log("lastClose:", lastClose, "lastSMA:", lastSMA, )
    return (lastClose - lastSMA) / lastSMA
    //return Math.abs(lastClose - last) / last
  },

  atr(bars) {
    const atr = ATR.calculate( {
      period:  14,
      low: bars.map( bar => bar.low),
      high: bars.map( bar => bar.high),
      close: bars.map( bar => bar.close),
    })
    return atr[ atr.length - 1 ]
  },

  cutText(inputText, maxLength) {
    let sentences = inputText.split(/(?<=\. |\.\n)/);
    let outputText = "";
    for (let i = 0; i < sentences.length; i++) {
        if ((outputText + sentences[i]).length <= maxLength) {
            outputText += sentences[i];
        } else {
            break;
        }
    }
    return outputText;
}

}

export default utils