import { MaterialPhoto, formatQuantity } from './ui';
import { useContext, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Archive, ArrowLeft, ChevronRight, FileText, Plus, Trash2 } from 'lucide-react';
import { Auth, api } from './lib';
import { ActionRequired, IssueDetails, type Issue } from './reviews';
import { messageOf, useI18n, type Message } from './i18n';

type Post = { id:number; material_id:number; display_code:string; name:string; unit:string; status:string; deposit_status:string; stock_quantity:number; initial_quantity:number; collected_quantity:number; photos:{id:number;url:string}[]; issues:Issue[] };
type Management = { material_id:number; version:number; has_history:boolean; disposition:'deleted'|'archived'|null; can_delete:boolean; can_archive:boolean; blocked_reason:string };
type Draft = { request_key:string; name?:string; photo_ids:number[] };
type Selection = { action:'delete'|'archive'|'draft'; name:string; post?:Post; state?:Management; draft?:Draft };

export function ManagedPosts() {
  const { user, loading } = useContext(Auth), navigate = useNavigate(), { msg } = useI18n();
  const [posts,setPosts] = useState<Post[]>([]), [management,setManagement] = useState<Management[]>([]), [draft,setDraft] = useState<Draft|null>(null);
  const [error,setError] = useState<Message>(''), [ready,setReady] = useState(false), [selection,setSelection] = useState<Selection|null>(null), [busy,setBusy] = useState(false), [notice,setNotice] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  async function load() {
    const [deposits, details] = await Promise.all([api<{deposits:Post[]}>('/deposits'), api<{management:Management[];draft:Draft|null}>('/me/posts')]);
    setPosts(deposits.deposits);setManagement(details.management);setDraft(details.draft);setReady(true);
  }
  useEffect(()=>{ if(!loading&&!user)navigate('/login?next=/me/posts',{replace:true}); },[loading,user?.id,navigate]);
  useEffect(()=>{
    if(!user)return;let live=true;
    const refresh=()=>{if(live)void load().catch(e=>{if(live){setError(messageOf(e));setReady(true);}});};
    refresh();const timer=setInterval(refresh,10000);window.addEventListener('focus',refresh);
    return()=>{live=false;clearInterval(timer);window.removeEventListener('focus',refresh);};
  },[user?.id]);
  useEffect(()=>{if(selection)dialog.current?.showModal();else dialog.current?.close();},[selection]);
  async function confirm() {
    if(!selection)return;setBusy(true);setError('');
    try {
      if(selection.action==='draft')await api('/deposit-draft/delete',{confirm:true,request_key:selection.draft?.request_key});
      else await api(`/me/posts/${selection.post?.material_id}/manage`,{action:selection.action,confirm:true,version:selection.state?.version});
      setNotice(selection.action==='archive'?'Material archived. Its history remains available.':selection.action==='draft'?'Draft deleted.':'Material deleted from your posts.');
      setSelection(null);await load();
    }catch(e){setError(messageOf(e));}finally{setBusy(false);}
  }
  const actionLabel=selection?.action==='archive'?'Archive material':selection?.action==='draft'?'Delete draft':'Delete material';
  return <div className="flow-page managed-posts">
    <Link className="back-link" to="/me"><ArrowLeft size={18}/>Profile</Link>
    <div className="page-heading"><h1>My posts</h1><p>Manage your drafts and materials.</p></div>
    {error&&!selection&&<div className="notice" role="alert">{msg(error)}</div>}
    {notice&&<p className="post-management-notice" role="status">{notice}</p>}
    <ActionRequired count={posts.reduce((count,post)=>count+post.issues.filter(issue=>issue.status==='open').length,0)}/>
    {!ready?<p>Loading your posts…</p>:<div className="post-list">
      {draft&&<article className="managed-post">
        <Link className="active-task" to="/deposit/new"><FileText size={24}/><div><b>{draft.name||'Untitled material'}</b><small>Draft · Continue adding information</small></div><ChevronRight size={18}/></Link>
        <div className="post-management-actions"><button className="button outline" onClick={()=>{setError('');setSelection({action:'draft',name:draft.name||'Untitled material',draft});}}><Trash2 size={17}/>Delete draft</button></div>
      </article>}
      {posts.map(post=>{
        const state=management.find(item=>item.material_id===post.material_id), archived=state?.disposition==='archived'||post.status==='closed';
        const status=archived?'Removed / Archived':post.deposit_status!=='confirmed'?'Ready for drop-off':post.status==='unavailable'?'Needs Review':post.status.charAt(0).toUpperCase()+post.status.slice(1);
        return <article className="managed-post" key={post.id}>
          <Link className="active-task" to={`/deposits/${post.id}${post.deposit_status==='confirmed'?'/success':''}`}><MaterialPhoto src={post.photos[0]?.url} alt=""/><div><span>{post.display_code}</span><b>{post.name}</b><small>{status} · {formatQuantity(post.deposit_status==='confirmed'?post.stock_quantity:post.initial_quantity,post.unit)}</small>{post.deposit_status==='confirmed'&&<small className="post-update">{formatQuantity(post.collected_quantity,post.unit)} collected · {post.stock_quantity} remaining</small>}{post.issues.map(issue=><small className="post-update" key={issue.id}>Reported: {issue.reason_label||issue.reason.replaceAll('_',' ')} · {issue.status}</small>)}</div><ChevronRight size={18}/></Link>
          {state&&!archived&&<div className="post-management-actions">
            <button className="button outline" disabled={!state.can_delete&&!state.can_archive} onClick={()=>{setError('');setSelection({action:state.has_history?'archive':'delete',name:post.name,post,state});}}>{state.has_history?<Archive size={17}/>:<Trash2 size={17}/>} {state.has_history?'Archive material':'Delete material'}</button>
            {state.blocked_reason&&<p>{state.blocked_reason}</p>}
            {!state.blocked_reason&&state.has_history&&<p>Archive keeps all reservation, collection and credit history.</p>}
          </div>}
          {post.issues.map(issue=><IssueDetails key={issue.id} issue={issue}/>)}
        </article>;
      })}
      {!draft&&!posts.length&&<p>No materials yet.</p>}
    </div>}
    <Link className="button dark full spaced" to="/deposit/new?fresh=1">Add material<Plus size={18}/></Link>
    <dialog ref={dialog} className="post-management-dialog" onCancel={event=>{event.preventDefault();if(!busy)setSelection(null);}} aria-labelledby="post-management-title">
      <h2 id="post-management-title">{actionLabel}?</h2><p className="post-management-name">{selection?.name}</p>
      <p>{selection?.action==='archive'?'This material will no longer be available to reserve. Existing transaction records and any eligible return remain available.':selection?.action==='draft'?'This removes the saved draft. You can start a new material at any time.':'This removes the material from your posts and Explore. This cannot be undone. Existing credit and inventory audit records are kept.'}</p>
      {error&&<div className="notice" role="alert">{msg(error)}</div>}
      <div className="action-stack"><button autoFocus className="button outline full" disabled={busy} onClick={()=>setSelection(null)}>Keep {selection?.action==='draft'?'draft':'material'}</button><button className={`button ${selection?.action==='archive'?'dark':'danger'} full`} disabled={busy} aria-busy={busy} onClick={()=>void confirm()}>{busy?'Saving…':actionLabel}</button></div>
    </dialog>
  </div>;
}
