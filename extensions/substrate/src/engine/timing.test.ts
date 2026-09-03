import { timing } from './timing'

describe('timing comparison', () => {
  beforeEach(() => timing.reset())

  it('records comparable elapsed seconds for hand and agent runs', () => {
    timing.start('by-hand', 1_000)
    timing.stop(66_000)
    timing.start('with-agent', 100_000)
    timing.stop(125_000)

    expect(timing.get().results).toEqual({ 'by-hand': 65, 'with-agent': 25 })
  })
})
