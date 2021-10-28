var z = require('zero-fill')
  , n = require('numbro')
  , Phenotypes = require('../../../lib/phenotype')

module.exports = {
  name: 'api_signal',
  description: 'Buy when recieve signal from api.',

  getOptions: function () {
    this.option('period', 'period length, same as --period_length', String, '1s')
    this.option('period_length', 'period length, same as --period', String, '1s')

    this.option('no_backfill', 'disable backfill', Boolean, true)
  },

  calculate: function (s) {
  },

  onPeriod: function (s, cb) {
    if (s.apiSignal) {
      if (s.apiSignal === 'sell') {
        s.signal = 'sell'
      }
      else if (s.apiSignal === 'buy') {
        s.signal = 'buy'
      } else {
        s.signal = null
      }
      // reset external signal
      s.apiSignal = null
    }
    cb()
  },

  onReport: function (s) {
    var cols = []
    cols.push(z(s.signal, ' ')[s.signal === false ? 'red' : 'green'])
    return cols
  },

  phenotypes: {
    // -- common
    period_length: Phenotypes.RangePeriod(1, 7200, 's'),
    markdown_buy_pct: Phenotypes.RangeFloat(-1, 5),
    markup_sell_pct: Phenotypes.RangeFloat(-1, 5),
    order_type: Phenotypes.ListOption(['maker', 'taker']),
    sell_stop_pct: Phenotypes.Range0(1, 50),
    buy_stop_pct: Phenotypes.Range0(1, 50),
    profit_stop_enable_pct: Phenotypes.Range0(1, 20),
    profit_stop_pct: Phenotypes.Range(1,20),

    // -- strategy
    no_backfill: Phenotypes.ListOption([true, false]),
  }
}

