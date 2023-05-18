const React = require('react');
const { Component } = React;
const { ViewPropTypes } = ReactNative = require('react-native');
const createReactClass = require('create-react-class');
const PropTypes = require('prop-types');
const {
    Dimensions,
    View,
    Animated,
    StyleSheet,
    InteractionManager,
} = ReactNative;

import ViewPager from "@react-native-community/viewpager";
const TimerMixin = require('react-timer-mixin');

const SceneComponent = require('./SceneComponent');
const DefaultTabBar = require('./DefaultTabBar');
const ScrollableTabBar = require('./ScrollableTabBar');

const AnimatedViewPager = Animated.createAnimatedComponent(ViewPager)

const ScrollableViewPager = createReactClass({
    mixins: [TimerMixin,],
    statics: {
        DefaultTabBar,
        ScrollableTabBar,
    },
    scrollOnMountCalled: false,

    propTypes: {
        tabBarPosition: PropTypes.oneOf(['top', 'bottom', 'overlayTop', 'overlayBottom',]),
        initialPage: PropTypes.number,
        page: PropTypes.number,
        onChangeTab: PropTypes.func,
        onScroll: PropTypes.func,
        renderTabBar: PropTypes.any,
        style: ViewPropTypes.style,
        contentProps: PropTypes.object,
        scrollWithoutAnimation: PropTypes.bool,
        locked: PropTypes.bool,
        prerenderingSiblingsNumber: PropTypes.number,
    },

    getDefaultProps() {
        return {
            tabBarPosition: 'top',
            initialPage: 0,
            page: -1,
            onChangeTab: () => { },
            onScroll: () => { },
            contentProps: {},
            scrollWithoutAnimation: false,
            locked: false,
            prerenderingSiblingsNumber: 0,
        };
    },

    getInitialState() {
        const containerWidth = Dimensions.get('window').width;
        let scrollValue;
        let positionAndroid;
        let offsetAndroid;

        positionAndroid = new Animated.Value(this.props.initialPage);
        offsetAndroid = new Animated.Value(0);
        scrollValue = Animated.add(positionAndroid, offsetAndroid);

        const callListeners = this._polyfillAnimatedValue(scrollValue);
        let positionAndroidValue = this.props.initialPage;
        let offsetAndroidValue = 0;
        positionAndroid.addListener(({ value, }) => {
            positionAndroidValue = value;
            callListeners(positionAndroidValue + offsetAndroidValue);
        });
        offsetAndroid.addListener(({ value, }) => {
            offsetAndroidValue = value;
            callListeners(positionAndroidValue + offsetAndroidValue);
        });

        return {
            currentPage: this.props.initialPage,
            scrollValue,
            positionAndroid,
            offsetAndroid,
            containerWidth,
            sceneKeys: this.newSceneKeys({ currentPage: this.props.initialPage, }),
        };
    },

    componentWillReceiveProps(props) {
        if (props.children !== this.props.children) {
            this.updateSceneKeys({ page: this.state.currentPage, children: props.children, });
        }

        if (props.page >= 0 && props.page !== this.state.currentPage) {
            this.goToPage(props.page);
        }
    },

    componentWillUnmount() {
        this.state.positionAndroid.removeAllListeners();
        this.state.offsetAndroid.removeAllListeners();
    },

    goToPage(pageNumber) {
        if (this.viewPager) {
            if (this.props.scrollWithoutAnimation) {
                this.viewPager.setPageWithoutAnimation(pageNumber);
            } else {
                this.viewPager.setPage(pageNumber);
            }
        }

        const currentPage = this.state.currentPage;
        this.updateSceneKeys({
            page: pageNumber,
            callback: this._onChangeTab.bind(this, currentPage, pageNumber),
        });
    },

    renderTabBar(props) {
        if (this.props.renderTabBar === false) {
            return null;
        } else if (this.props.renderTabBar) {
            return React.cloneElement(this.props.renderTabBar(props), props);
        } else {
            return <DefaultTabBar {...props} />;
        }
    },

    updateSceneKeys({ page, children = this.props.children, callback = () => { }, }) {
        let newKeys = this.newSceneKeys({ previousKeys: this.state.sceneKeys, currentPage: page, children, });
        this.setState({ currentPage: page, sceneKeys: newKeys, }, callback);
    },

    newSceneKeys({ previousKeys = [], currentPage = 0, children = this.props.children, }) {
        let newKeys = [];
        this._children(children).forEach((child, idx) => {
            let key = this._makeSceneKey(child, idx);
            if (this._keyExists(previousKeys, key) ||
                this._shouldRenderSceneKey(idx, currentPage)) {
                newKeys.push(key);
            }
        });
        return newKeys;
    },

    // Animated.add and Animated.divide do not currently support listeners so
    // we have to polyfill it here since a lot of code depends on being able
    // to add a listener to `scrollValue`. See https://github.com/facebook/react-native/pull/12620.
    _polyfillAnimatedValue(animatedValue) {

        const listeners = new Set();
        const addListener = (listener) => {
            listeners.add(listener);
        };

        const removeListener = (listener) => {
            listeners.delete(listener);
        };

        const removeAllListeners = () => {
            listeners.clear();
        };

        animatedValue.addListener = addListener;
        animatedValue.removeListener = removeListener;
        animatedValue.removeAllListeners = removeAllListeners;

        return (value) => listeners.forEach(listener => listener({ value, }));
    },

    _shouldRenderSceneKey(idx, currentPageKey) {
        let numOfSibling = this.props.prerenderingSiblingsNumber;
        return (idx < (currentPageKey + numOfSibling + 1) &&
            idx > (currentPageKey - numOfSibling - 1));
    },

    _keyExists(sceneKeys, key) {
        return sceneKeys.find((sceneKey) => key === sceneKey);
    },

    _makeSceneKey(child, idx) {
        return child.props.tabLabel + '_' + idx;
    },

    renderScrollableContent() {
        const scenes = this._composeScenes();
        return <AnimatedViewPager
            key={this._children().length}
            style={styles.scrollableContentAndroid}
            initialPage={this.props.initialPage}
            onPageSelected={this._updateSelectedPage}
            keyboardDismissMode="on-drag"
            scrollEnabled={!this.props.locked}
            onPageScroll={Animated.event(
                [{
                    nativeEvent: {
                        position: this.state.positionAndroid,
                        offset: this.state.offsetAndroid,
                    },
                },],
                {
                    useNativeDriver: true,
                    listener: this._onScroll,
                },
            )}
            ref={(r) => { this.viewPager = r; }}
            {...this.props.contentProps}
        >
            {scenes}
        </AnimatedViewPager>;
    },

    _composeScenes() {
        return this._children().map((child, idx) => {
            let key = this._makeSceneKey(child, idx);
            return <SceneComponent
                key={child.key}
                shouldUpdated={this._shouldRenderSceneKey(idx, this.state.currentPage)}
                style={{ width: this.state.containerWidth, }}
            >
                {this._keyExists(this.state.sceneKeys, key) ? child : <View tabLabel={child.props.tabLabel} />}
            </SceneComponent>;
        });
    },

    _updateSelectedPage(nextPage) {
        let localNextPage = nextPage;
        if (typeof localNextPage === 'object') {
            localNextPage = nextPage.nativeEvent.position;
        }

        const currentPage = this.state.currentPage;
        this.updateSceneKeys({
            page: localNextPage,
            callback: this._onChangeTab.bind(this, currentPage, localNextPage),
        });
    },

    _onChangeTab(prevPage, currentPage) {
        this.props.onChangeTab({
            i: currentPage,
            ref: this._children()[currentPage],
            from: prevPage,
        });
    },

    _onScroll(e) {
        const { position, offset, } = e.nativeEvent;
        this.props.onScroll(position + offset);
    },

    _handleLayout(e) {
        const { width, } = e.nativeEvent.layout;

        if (!width || width <= 0 || Math.round(width) === Math.round(this.state.containerWidth)) {
            return;
        }

        this.setState({ containerWidth: width });

        this.requestAnimationFrame(() => {
            this.goToPage(this.state.currentPage);
        });
    },

    _children(children = this.props.children) {
        return React.Children.map(children, (child) => child);
    },

    render() {
        let overlayTabs = (this.props.tabBarPosition === 'overlayTop' || this.props.tabBarPosition === 'overlayBottom');
        let tabBarProps = {
            goToPage: this.goToPage,
            tabs: this._children().map((child) => child.props.tabLabel),
            activeTab: this.state.currentPage,
            scrollValue: this.state.scrollValue,
            containerWidth: this.state.containerWidth,
        };

        if (this.props.tabBarBackgroundColor) {
            tabBarProps.backgroundColor = this.props.tabBarBackgroundColor;
        }
        if (this.props.tabBarActiveTextColor) {
            tabBarProps.activeTextColor = this.props.tabBarActiveTextColor;
        }
        if (this.props.tabBarInactiveTextColor) {
            tabBarProps.inactiveTextColor = this.props.tabBarInactiveTextColor;
        }
        if (this.props.tabBarTextStyle) {
            tabBarProps.textStyle = this.props.tabBarTextStyle;
        }
        if (this.props.tabBarUnderlineStyle) {
            tabBarProps.underlineStyle = this.props.tabBarUnderlineStyle;
        }
        if (overlayTabs) {
            tabBarProps.style = {
                position: 'absolute',
                left: 0,
                right: 0,
                [this.props.tabBarPosition === 'overlayTop' ? 'top' : 'bottom']: 0,
            };
        }

        return <View style={[styles.container, this.props.style,]} onLayout={this._handleLayout}>
            {this.props.tabBarPosition === 'top' && this.renderTabBar(tabBarProps)}
            {this.renderScrollableContent()}
            {(this.props.tabBarPosition === 'bottom' || overlayTabs) && this.renderTabBar(tabBarProps)}
        </View>;
    },
});

module.exports = ScrollableViewPager;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        overflow:'hidden'
    },
    scrollableContentAndroid: {
        flex: 1,
    },
});
