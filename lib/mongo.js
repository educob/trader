import { MongoClient } from 'mongodb';
import fs from 'fs';



let db = null

const mongo = {

  connect: async function() {
    if(!!db) return db
    const MONGO_URL = `mongodb://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/trader?retryWrites=true&w=majority`
    //console.log("MONGO_URL:", MONGO_URL)
    try {
      const mongo_client = await MongoClient.connect(MONGO_URL, { useNewUrlParser: true, useUnifiedTopology: true })
      db = mongo_client.db() // db.getCollection('coin').createIndex( { times: 1 } ) // db.getCollection('coin').ensureIndex({"times":1},{"unique":true})
    } catch (error) {
      //console.log("MONGO_URL:", MONGO_URL)
      console.log(`Mongo DB error:`, error)
      process.exit(1)
    }
  },

  load_CSVs: async function(dir, skip=0, optionable=false) {
    //dir = `${process.cwd()}/../${dir})`
    const files = await fs.promises.readdir(dir)
    console.log("files:", files)
    for(const file of files) {
      if(!file.endsWith('.csv')) continue
      this.load_CSV(dir, file, skip, optionable)
    }
  },

  load_CSV: async function(dir, file, skip=0, optionable=false) { console.log("file:", file, optionable)
    const path = `${dir}/${file}`
    const csv = await fs.promises.readFile(path, 'utf-8')
    const lines = csv.split(/\r?\n/)
    let count = 0
    for(const line of lines) {
      count += 1.
      if(skip >= count) continue
      const record = line.split(',')
      const symbol = record[0].replace(/"/g, "")
      if(!symbol)
        continue
      if(!!optionable) {
        const { modifiedCount } = await db.collection('security').updateOne( {_id: symbol }, { $set: { optionable } }, { upsert: true } )
      } else {
        const name = record[1]
        const exchange = record[2]
        //const industry = record[3]
        //const sector = record[4]
        const { modifiedCount } = await db.collection('security').updateOne( {_id: symbol }, { $set: { name, exchange } }, { upsert: true } )
        //const { modifiedCount } = await db.collection('security').updateOne( {_id: symbol }, { $set: { name, exchange, sector, industry } }, { upsert: true } )
      }
    }
  },

  // carga csv solo con symbol.
  load_CSV2: async function(dir, file) {
    const path = `${dir}/${file}`
    const csv = await fs.promises.readFile(path, 'utf-8')
    const lines = csv.split(/\r?\n/)
    for(const line of lines) {
      const record = line.split(',')
      const symbol = record[0].toUpperCase()
      if(!symbol)
        continue
      const { modifiedCount } = await db.collection('security').updateOne( {_id: symbol }, { $set: { exchange: 'POPEYE' } }, { upsert: true } )
    }
  },

  // carga csv solo con symbol.
  load_CSV_w_per: async function(dir, file, skip) {
    const path = `${dir}/${file}`
    const csv = await fs.promises.readFile(path, 'utf-8')
    const lines = csv.split(/\r?\n/)
    let count = 0
    for(const line of lines) {
      count += 1.
      if(skip >= count) continue
      const record = line.split(',')
      const symbol = record[0].toUpperCase()
      if(!symbol) continue
      const per = parseFloat(record[2])
      if(per == NaN) continue
      const { modifiedCount, upserted } = await db.collection('security').updateOne( {_id: symbol }, { $set: { per } }, { upsert: true } )
      if(!!upserted) 
        console.log(`${symbol} was upserted`)
    }
  },

  remove_failed_symbols: async function(dir, file) {
    const logs = await db.collection('log').find( { code: 10 } ).toArray()
    for(const log of logs) {
      const { deletedCount } = await db.collection('security').deleteOne( {_id: log.symbol } )
    }
  },


}

export default mongo;

// delete fields that start with ": db.getCollection('security').deleteMany({ _id: /^"/ })





