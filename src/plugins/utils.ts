

import { GraphBuildContext } from "../graph/context";
import { Item } from "../graph/tabular-source"

export enum PluginType {
    TabularSource,
}

export type TabularSourcePlugin = PluginBase<PluginType.TabularSource, {
    addItem(item: Item): void;
}>

export type Plugin = TabularSourcePlugin

const plugins: Record<PluginType, Array<Plugin>> = {
    [PluginType.TabularSource]: []
}

export function mountPluginFor<T extends PluginType>(type: T, ctx: GetContextByPluginType<T>) {
    return plugins[type].reduce((acc, item) => {
        return {
            ...acc,
            ...item.mount(ctx as any)
        }
    }, {})
}

export function installPlugin(plugin: Plugin) {
    plugins[plugin.type].push(plugin)
}

export type PluginBase<T extends PluginType, C> = {
    type: T,
    mount(ctx: PluginContext<C>): object,
}


/* 
    the object that gets passed to the plugin on creation
    Always includes the buildContext, but can also include something else (depending on the plugin type)
*/
type PluginContext<C> = C & { buildContext: GraphBuildContext }



/*
    Extracts the type of the context for the given plugin type
*/
type GetContextByPluginType<T extends PluginType> =
    Extract<Plugin, PluginBase<T, any>> extends // determine the plugin based on the given type (threats the Plugin union as a array and loops through each item to find the required plugin based on the given type)
    PluginBase<T, infer C> ? PluginContext<C> : never; // based on the extracted PluginBase we 'infer' the type of C