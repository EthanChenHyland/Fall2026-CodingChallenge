import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, FolderHeart, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { CreateCollectionDialog } from '../components/Dialogs'

export function CollectionsPage() {
  const { data, isLoading } = useQuery({ queryKey: ['collections'], queryFn: api.collections })

  return (
    <>
      <section className="page-title-row">
        <div><span className="eyebrow">YOUR LIBRARY</span><h1>Collections</h1><p>Loose thoughts become useful when they have somewhere to live.</p></div>
        <CreateCollectionDialog trigger={<button className="primary-button"><Plus size={17} /> New collection</button>} />
      </section>
      {isLoading ? <div className="collection-grid"><div className="collection-skeleton" /><div className="collection-skeleton" /></div> : data?.collections.length ? (
        <div className="collection-grid">
          {data.collections.map((collection) => (
            <Link className="collection-card" to={`/collections/${collection.id}`} key={collection.id}>
              <div className="collection-cover">{collection.cover_url ? <img src={collection.cover_url} alt="" /> : <div className="blank-cover"><FolderHeart size={28} /><span>Ready for a first save</span></div>}<span className="open-badge"><ArrowUpRight size={16} /></span></div>
              <div className="collection-card-copy"><div><h3>{collection.name}</h3><p>{collection.description || 'No description yet.'}</p></div><span>{collection.item_count} saved</span></div>
            </Link>
          ))}
          <CreateCollectionDialog trigger={<button className="new-collection-tile"><Plus size={24} /><span>Create another collection</span></button>} />
        </div>
      ) : <div className="empty-state"><FolderHeart size={30} /><h3>Your first collection starts here.</h3><CreateCollectionDialog trigger={<button className="primary-button"><Plus size={17} /> Create collection</button>} /></div>}
    </>
  )
}
