import {pathToFileURL} from 'node:url'
export function deploymentURL(value){const base=new URL(value);if(!['http:','https:'].includes(base.protocol)||base.username||base.password)throw Error('Invalid deployment URL');return base}
const whitelist=['content-type','content-encoding','cache-control','vary','etag','last-modified']
export async function inspectHeaders(value,{anonymousApi=false,fetcher=fetch}={}){
 const base=deploymentURL(value),results=[],seen=new Set()
 async function inspect(url,resource){url=deploymentURL(url);if(url.origin!==base.origin||seen.has(url.href))return '';seen.add(url.href);const response=await fetcher(url,{redirect:'error',credentials:'omit',headers:{'accept-encoding':'gzip, br'}});results.push({resource,status:response.status,headers:Object.fromEntries(whitelist.map(k=>[k,response.headers.get(k)]))});return resource==='html'||resource==='css'?response.text():''}
 const html=await inspect(base,'html'),styles=[]
 for(const match of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)){const url=new URL(match[1],base);if(url.origin!==base.origin)continue;if(/\.(woff2?|ttf|otf)$/.test(url.pathname))await inspect(url,'font');else if(/[.-][\w-]{8,}\.(js|css)$/.test(url.pathname)){const type=url.pathname.endsWith('.css')?'css':'js',body=await inspect(url,type);if(type==='css')styles.push([url,body])}}
 for(const [css,body] of styles)for(const match of body.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/gi)){const url=new URL(match[1],css);if(url.origin===base.origin&&/\.(woff2?|ttf|otf)$/.test(url.pathname))await inspect(url,'font')}
 if(anonymousApi)for(const path of ['/api/me','/api/nodes','/api/nodes/1/metrics?hours=24&points=288&series=ping'])await inspect(new URL(path,base),'anonymous-api')
 return results
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const args=process.argv.slice(2),index=args.indexOf('--base-url');if(index<0||!args[index+1])throw Error('An authorized real deployment URL is required');console.log(JSON.stringify(await inspectHeaders(args[index+1],{anonymousApi:args.includes('--anonymous-api')}),null,2))}
