// https://github.com/transitive-bullshit/bing-chat
import { BingChat } from 'bing-chat'
import { oraPromise } from 'ora'


const api = new BingChat({
  cookie: '1-8GlFtiq53n4Gic1SPoXbImV_kPLkKULFE4py_MkzNL46CCony32XFup3RoyzVE7K7un5Eda9HtXSH_1nH0o8HXpoOGK_6Zls-YgxsL6vs5Pe8wukQcqDVrvNV4TYbSqVsM5SX5veKM5hvxNL8lyWGoH1pGqUOoglGvgTtSD1Yoz5vioHMJjmADhBx5WDO8jZBrUbP7DwGkfazfbol5upg'
})


const gpt = {

  ask: async function( prompt) {   
    const res = await oraPromise(api.sendMessage(prompt), {
      text: prompt
    })

    //console.log("gpt res:", res)
    return res.text
  },

  analyze_news: async function ( company, news ) {
    const prompt = `Analyze this news for company ${company} and tell me if you think the price of the shares will be highly impacted either positively or negatively or not really impacted much.
    If you think the price will either be impacted positvely or negatively but not in an important way answer with 'neutral'.
    '''${news}'''
    Please provide your answer in JSON format with the possible values for the ‘impact’ field being ‘positive’, ‘negative’, or ‘neutral’
    Your answer should be just the json format not any extra text.`
    return this.ask(prompt)
  },

}



export default gpt;
