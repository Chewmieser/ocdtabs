/*/
 *
 * OCDTabs - Background.js
 * -----------------------
 * Steve Rolfe      8/2012
 *
/*/

/* |----[ Setup Variables ]----| */
var windows=[]; // Create our windows array
var slave; // Holds our slave window's id

/* |----[ Register Tab Hooks ]----| */
chrome.tabs.onUpdated.addListener(handleTabUpdates);
chrome.tabs.onRemoved.addListener(handleTabRemoval);
chrome.tabs.onActivated.addListener(handleTabActive);

/* |----[ Run ]----| */
init();

/* |----[ Setup Functions ]----| */

// Initialize OCDTabs
// - Creates the slave window
// - Stores the initial record of windows, containers and tabs
// - CALLS: compactTabs when finished
function init(){
	// Get a listing of all available windows (and their tabs)
	chrome.windows.getAll({populate:true},function(win){
		// Create our container window
		var ob={win:win};
		chrome.windows.create({focused:false},function(o){
			// Save the new window, minimize it
			slave=o.id;
			chrome.windows.update(o.id,{state:"minimized"});
			
			// Go through windows and save them to the object
			for (i in win){
				var winOb={id:win[i].id,containers:[]};

				// Sort the tabs into host containers
				for (t in win[i].tabs){
					// Try to match up the current host
					var found=false;
					for (z in winOb.containers){
						if (winOb.containers[z].host==win[i].tabs[t].url.split('/')[2]){
							// We found a match. Add the tab in this container
							found=true;

							// Do we need to update the active field?
							if (win[i].tabs[t].active && !winOb.containers[z].active){
								winOb.containers[z].active=true;
							}

							// Push the tab to the container
							winOb.containers[z].tabs.push({
								tab_id: win[i].tabs[t].id,
								url: win[i].tabs[t].url
							});
						}
					}

					// We didn't find anything? Create a container object
					if (!found){
						winOb.containers.push({
							host: win[i].tabs[t].url.split('/')[2],
							icon: win[i].tabs[t].favIconUrl,
							tab_id: -1,
							active: win[i].tabs[t].active,
							tabs: [{tab_id: win[i].tabs[t].id, url:win[i].tabs[t].url}]
						});
					}
				}

				// Push WinOb to the window object
				windows.push(winOb);
			}

			// We're all done. Deflate tabs
			deflateTabs();
		}.bind(ob));
	});
}

// Auxilary function for deflateGroup
// - CALLS: deflateGroup on each container, per window that is non-active
function deflateTabs(){
	// Deflate per window
	for (i in windows){
		// Create containers and move non-containers to the slave window
		for (z in windows[i].containers){
			if (!windows[i].containers[z].active){
				deflateGroup(i,z);
			}
		}
	}
}

/* |----[ Helper Functions ]----| */

// Compacts tabs into a group container
// - Creates group container
// - Sets group as inactive
// - Moves tabs to slave window
function deflateGroup(win,con){
	// Create a group
	var tm={i:win,z:con};
	chrome.tabs.create({url: "expand.html?i="+encodeURIComponent(windows[win].containers[con].icon),active:false,pinned:true,windowId:windows[win].id},function(ob){
		windows[this.i].containers[this.z].tab_id=ob.id;
	}.bind(tm));
	
	// Set the group to inactive
	windows[win].containers[con].active=false;
	
	// Move the group's tabs
	var tabList=[];
	for (t in windows[win].containers[con].tabs){
		tabList.push(windows[win].containers[con].tabs[t].tab_id);
	}
	chrome.tabs.move(tabList,{windowId:slave,index:-1});
}

// Expands a group into tabs
// - Moves group tabs to proper window
// - Forces proper tab to become active
// - Deflates all other active groups
// - Sets itself as active and removes it's group tab
function inflateGroup(win,con,ignoreActiveSet){
	// Move group tabs to the proper window
	var tabList=[];
	for (t in windows[win].containers[con].tabs){
		tabList.push(windows[win].containers[con].tabs[t].tab_id);
	}
	
	// Move and force the first tab to become active
	var ignore=(ignoreActiveSet=="undefined")?false:ignoreActiveSet;
	var obUp={tabId:tabList[0],win:win,con:con,ias:ignore};
	chrome.tabs.move(tabList,{windowId:windows[win].id,index:-1},function(o){
		var a=this.ias?false:true;
		chrome.tabs.update(this.tabId,{active:a},function(o){
			// Next, move all tabs from an active group
			for (c in windows[win].containers){
				if (windows[win].containers[c].active){
					deflateGroup(win,c);
				}
			}

			// Set us to active and remove the group tab
			windows[win].containers[con].active=true;

			if (windows[win].containers[con].tab_id!=-1){
				chrome.tabs.remove(windows[win].containers[con].tab_id);
				windows[win].containers[con].tab_id=-1;
			}
		}.bind(this));
	}.bind(obUp));
}

function lookupTabId(tab_id,win){
	var tabOb={f:false,g:false,w:-1,c:-1,t:-1}
	if (win!="undefined"){tabOb.w=win}
	for (w in windows){
		for (c in windows[w].containers){
			if (windows[w].containers[c].tab_id==tab_id){
				// A group has been updated
				tabOb.f=true;tabOb.g=true;tabOb.w=w;tabOb.c=c;
			}

			for (t in windows[w].containers[c].tabs){
				if (windows[w].containers[c].tabs[t].tab_id==tab_id){
					// A tab has been updated
					tabOb.f=true;tabOb.g=false;tabOb.w=w;tabOb.c=c;tabOb.t=t;
				}
			}
		}
	}
	
	return tabOb;
}

/* |----[ Handler Functions ]----| */

// Moves tabs between containers and updates their urls
// - Resolves window/tab ID
// - Updates tab URLs
// - Moves tabs between containers
// - Adds containers
// - Removes containers
function handleTabUpdates(tab_id,changes,tab){
	if (tab.windowId==slave){return;} // Stop if the tab is in the slave window
	if (tab.pinned){return;} // Stop if the tab is pinned
	
	// Resolve the window's ID
	var win=-1;
	for (w in windows){
		if (windows[w].id==tab.windowId){win=w;}
	}
	
	if (win==-1){return;} // The window isn't being tracked. Ignore for now.
	
	// Next, figure our if we currently have the tab in our system
	var tabOb=lookupTabId(tab_id,win);
	
	if (!tabOb.f && tab.url=="chrome://newtab/"){return;} // Stop if we have a new tab page
	if (tabOb.f && tabOb.g){return;} // Stop if we have a group
	
	// If the host didn't change then just update the value in our system
	if (tabOb.f && tab.url.split('/')[2]==windows[tabOb.w].containers[tabOb.c].host){
		windows[tabOb.w].containers[tabOb.c].tabs[tabOb.t].url=tab.url;
		return;
	}
	
	// If the host changed, then...
	var f=false;
	for (c in windows[tabOb.w].containers){
		if (tab.url.split('/')[2]==windows[tabOb.w].containers[c].host){
			f=true;
			
			// Found the new host. Splice the old tab out and put it here
			windows[tabOb.w].containers[c].tabs.push({tab_id:tab_id,url:tab.url});
			if (tabOb.f){
				windows[tabOb.w].containers[tabOb.c].tabs.splice(tabOb.t,1);
				
				// Does the old container need to be removed?
				if (windows[tabOb.w].containers[tabOb.c].tabs.length==0){
					// Yup. Splice it out
					windows[tabOb.w].containers.splice(tabOb.c,1);
				}
			}
			
			inflateGroup(tabOb.w,c,true);
		}
	}
	
	if (!f){
		// We don't know the new host... Add it to the system
		if (changes.status!="complete"){return;} // Ignore non-complete loads (we want a favicon)
		var newCont=windows[tabOb.w].containers.push({
			host: tab.url.split('/')[2],
			icon: tab.favIconUrl,
			tab_id: -1,
			active: false,
			tabs: [{tab_id:tab_id,url:tab.url}]
		})-1;
		
		// Remove the tab from its previous host
		if (tabOb.f){windows[tabOb.w].containers[tabOb.c].tabs.splice(tabOb.t,1);}
		
		// Run an inflate on the new group (will just deflate old groups)
		inflateGroup(tabOb.w,newCont,true);
	}
}

// Stops tracking tabs when they're removed from the system
// - Resolves tab ID
// - Removes the tab from the system
// - Possibly removes the group from the system
function handleTabRemoval(tab_id,info){	
	var tabOb=lookupTabId(tab_id);
	if (tabOb.f && !tabOb.g){
		// It's a regular tab. Stop tracking it
		windows[tabOb.w].containers[tabOb.c].tabs.splice(tabOb.t,1);
		
		// Do we need to remove the group?
		if (windows[tabOb.w].containers[tabOb.c].tabs.length==0){
			windows[tabOb.w].containers.splice(tabOb.c,1);
		}
	}
}

// Expands groups if a group becomes active
// - Resolves a tab ID
// - Calls inflateGroup to expand the group
function handleTabActive(tab){
	// Resolve tab and window IDs to IDs in our array
	var tabOb=lookupTabId(tab.tabId);
	if (tabOb.f && tabOb.g){
		inflateGroup(tabOb.w,tabOb.c);
	}
}