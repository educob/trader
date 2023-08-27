import fs from 'fs';
import { createCanvas } from 'canvas';


const chart = {
  
  async drawCandleStickChart(bars, width=960, height=500, fileName) {

    // Define chart dimensions
      const margin = { top: 20, right: 20, bottom: 30, left: 50 };
      width = width - margin.left - margin.right;
      height = height - margin.top - margin.bottom;
      
      // Create canvas element
      const canvas = createCanvas(width + margin.left + margin.right, height + margin.top + margin.bottom);
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width + margin.left + margin.right, height +  margin.top + margin.bottom);

      const p1H = height / 100;

      const options = {}
      // Отступы свечей друг от друга
      options.margin = 10;
      // Ширина хвостов свечей
      options.lineWidth = 5;
      // Цвет нисходящий свечи
      // Color downward candles
      options.closeandleColorB = "red";
      // Цвет восходящий свечи
      // Color rising candles
      options.closeandleColorS = "green";

      let max = 0,
        min,
        stat,
        p1;
  
      bars.forEach(el => {
        // Находим максимальную цену
        max = el.high > max ? el.high : max;
        // Находим минимальную цену
        min = !min || el.low < min ? el.low : min;
      });
  
      // Разница между максимальной и минимальной ценой
      stat = max - min;
      // Один процент от разницы максимальной и минимальной цены
      p1 = stat / 100;
  
      // Основной расчет позиций свечей.
      const data = bars.map(el => {
        return {
          low: (100 - (stat - (max - el.low)) / p1) * p1H,
          high: (100 - (stat - (max - el.high)) / p1) * p1H,
          open: (100 - (stat - (max - el.open)) / p1) * p1H,
          close: (100 - (stat - (max - el.close)) / p1) * p1H
        };
      });
  
    // Нарисовать свечи на холсте
    // Draw candles on canvas
    const wP = width / data.length;

    data.forEach((el, i) => {
      ctx.strokeStyle =
        el.close > el.open
          ? options.closeandleColorB
          : el.close < el.open
          ? options.closeandleColorS
          : options.closeandleColorB;

      let x = i * (width / data.length);
      x += width / data.length / 2;

      let yO = data[i].open;
      let yC = data[i].close;

      ctx.lineWidth = (wP / 100) * options.lineWidth;

      yC = yO === yC ? yC + ctx.lineWidth : yC;
      ctx.beginPath();
      ctx.moveTo(x, data[i].high);
      ctx.lineTo(x, data[i].low);
      ctx.stroke();

      ctx.lineWidth = (wP / 100) * (100 - options.margin);
      ctx.beginPath();
      ctx.moveTo(x, yO);
      ctx.lineTo(x, yC);
      ctx.stroke();
    });      
  
    // Save as PNG file
    const buffer = canvas.toBuffer('image/png')
    fs.writeFileSync(`./pics/${fileName}.png`, buffer)
  },

  save_chart(canvas, file='image') {
    const buffer = canvas.toBuffer('image/png')
    fs.writeFileSync(`./pics/${file}.png`, buffer)
  },
}

export default chart