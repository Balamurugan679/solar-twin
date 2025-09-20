import fetch from 'node-fetch'

const CHANNEL_ID = "3079895"
const READ_KEY = "RT087M6BVUZAGPML"

export interface ThingSpeakData {
  voltage: number
  current: number
  power: number
  irradiance: number
  panelTemperature: number
  timestamp: string
  entryId: number
}

export interface ThingSpeakFeed {
  created_at: string
  entry_id: number
  field1: string | null
  field2: string | null
  field3: string | null
  field4: string | null
  field5: string | null
}

export interface ThingSpeakResponse {
  channel: {
    id: number
    name: string
    description: string
    latitude: string
    longitude: string
    field1: string
    field2: string
    field3: string
    field4: string
    field5: string
    created_at: string
    updated_at: string
    last_entry_id: number
  }
  feeds: ThingSpeakFeed[]
}

export class ThingSpeakReader {
  private channelId: string
  private readKey: string

  constructor(channelId: string = CHANNEL_ID, readKey: string = READ_KEY) {
    this.channelId = channelId
    this.readKey = readKey
  }

  async getLatestData(): Promise<ThingSpeakData | null> {
    try {
      const url = `https://api.thingspeak.com/channels/${this.channelId}/feeds.json?api_key=${this.readKey}&results=1`
      const response = await fetch(url)
      
      if (!response.ok) {
        throw new Error(`ThingSpeak API error: ${response.status}`)
      }

      const data = await response.json() as ThingSpeakResponse
      
      if (!data.feeds || data.feeds.length === 0) {
        console.warn('No data available from ThingSpeak')
        return null
      }

      const latestFeed = data.feeds[0]
      return this.parseFeed(latestFeed)
    } catch (error) {
      console.error('Error fetching ThingSpeak data:', error)
      return null
    }
  }

  async getHistoricalData(results: number = 10): Promise<ThingSpeakData[]> {
    try {
      const url = `https://api.thingspeak.com/channels/${this.channelId}/feeds.json?api_key=${this.readKey}&results=${results}`
      const response = await fetch(url)
      
      if (!response.ok) {
        throw new Error(`ThingSpeak API error: ${response.status}`)
      }

      const data = await response.json() as ThingSpeakResponse
      
      if (!data.feeds || data.feeds.length === 0) {
        console.warn('No historical data available from ThingSpeak')
        return []
      }

      return data.feeds.map(feed => this.parseFeed(feed)).filter(Boolean) as ThingSpeakData[]
    } catch (error) {
      console.error('Error fetching ThingSpeak historical data:', error)
      return []
    }
  }

  private parseFeed(feed: ThingSpeakFeed): ThingSpeakData | null {
    try {
      // Based on the actual data structure from ThingSpeak
      // field1: virtual sensor (null in current data)
      // field2: physical sensor (has values like 0.59118)
      // field3: result (null in current data)
      // field4: not present in current data
      // field5: not present in current data
      
      const physicalSensorValue = feed.field2 ? parseFloat(feed.field2) : 0
      
      return {
        voltage: feed.field1 ? parseFloat(feed.field1) : 0, // Virtual sensor
        current: physicalSensorValue, // Physical sensor value
        power: feed.field3 ? parseFloat(feed.field3) : 0, // Result
        irradiance: feed.field4 ? parseFloat(feed.field4) : 0,
        panelTemperature: feed.field5 ? parseFloat(feed.field5) : 0,
        timestamp: feed.created_at,
        entryId: feed.entry_id
      }
    } catch (error) {
      console.error('Error parsing ThingSpeak feed:', error)
      return null
    }
  }

  // Get channel information
  async getChannelInfo(): Promise<any> {
    try {
      const url = `https://api.thingspeak.com/channels/${this.channelId}.json?api_key=${this.readKey}`
      const response = await fetch(url)
      
      if (!response.ok) {
        throw new Error(`ThingSpeak API error: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('Error fetching ThingSpeak channel info:', error)
      return null
    }
  }
}

// Export singleton instance
export const thingSpeakReader = new ThingSpeakReader()
