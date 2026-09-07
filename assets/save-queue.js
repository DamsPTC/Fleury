// Advance past per-file errors, but keep the cursor unchanged for pauses or global failures.
export async function saveQueue({items,start=0,save,onSuccess,onFailure,onAdvance}) {
    for(let i=start;i<items.length;i++) {
        const item=items[i];
        try { await save(item); onSuccess(item); }
        catch(error) {
            if(error.name==='AbortError'||[401,403,429,507].includes(error.status))throw error;
            onFailure(item,error);
        }
        onAdvance(i+1);
    }
}
