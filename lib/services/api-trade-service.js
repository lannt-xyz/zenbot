module.exports = function (conf) {
  return {
    getOnTrading: () => {
      return conf.db.mongo.collection('on-trading')
    }
  }
}
