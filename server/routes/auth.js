import config from '../config'
import oauth2 from 'simple-oauth2'
import qs from 'querystring'
import router from './router'
import Promise from 'bluebird'
import {sessionProvider} from '../services/providers'
import {getOrCreateUser} from '../services/oauthService'

function initOauthMap(confMap, baseUrl) {
  var oauthMap = {}
  for (let k in confMap) {
    let conf = confMap[k]
    oauthMap[k] = oauth2(conf)
    let uri = conf.redirectUri
    uri = uri.startsWith('http') ? uri : (baseUrl + uri)
    console.log(uri)
    oauthMap[k].redirectUri = uri
    oauthMap[k].authUrl = oauthMap[k].authCode.authorizeURL({
      redirect_uri: uri,
      scope: conf.scope || '',
      state: conf.state
    })
  }
  return oauthMap
}
const oauthMap = initOauthMap(config.oauth2, config.baseUrl)

router.get('/auth/oauth2/:site', (ctx) => {
  var oauth = oauthMap[ctx.params.site]
  if (oauth) {
    ctx.redirect(oauth.authUrl)
  } else {
    throw new Error('no such site')
  }
})

router.get('/oauth2-callback/:site', async (ctx) => {
// http://localhost:3000/oauth2-callback/github?code=c0201ef0bce39b98ef3b&state=1234
  var code = ctx.query.code
  var state = ctx.query.state
  var site = ctx.params.site
  var oauth = oauthMap[site]
  if (!oauth || state !== config.oauth2[site].state) {
    ctx.body = 'Invalid'
    return
  }
  // TODO normalized save token and etc.
  let token = await Promise.promisify(oauth.authCode.getToken)({
    code: code,
    redirect_uri: oauth.redirectUri
  })
  if (token.includes('&')) {
    token = qs.parse(token).access_token
  }
  console.log('token:', token)
  // Get profile
  let user = await getOrCreateUser(site, token, ctx.state.privacy)
  if (!user) {
    throw new Error('not create user')
  }
  const sid = await sessionProvider.bindUser(user.id)
  ctx.cookies.set('sid', sid)
  ctx.redirect('/')
})

router.get('/auth/logout', async (ctx) => {
  const sid = ctx.cookies.get('sid')
  await sessionProvider.del(sid)
  ctx.cookies.set('sid', null)
  ctx.redirect('/')
})

router.get('/500', async (ctx) => {
  console.log('... 500')
  throw new Error('hello error 3')
})
