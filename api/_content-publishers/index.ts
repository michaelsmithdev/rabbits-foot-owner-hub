import type { ContentProvider } from '../_content-autopilot-server.js'
import { FacebookPublisher } from './facebook.js'
import { GoogleBusinessPublisher } from './google-business.js'
import type { SocialPublisher } from './types.js'
import { YouTubePublisher } from './youtube.js'

const publishers: Record<ContentProvider, SocialPublisher> = {
  facebook: new FacebookPublisher(),
  google_business: new GoogleBusinessPublisher(),
  youtube: new YouTubePublisher(),
}

export function publisherFor(provider: ContentProvider): SocialPublisher {
  return publishers[provider]
}

export type { ProviderAccount, PublishRecord, PublishResult, SocialPublisher } from './types.js'
export { freshGoogleAccessToken } from './google-auth.js'

